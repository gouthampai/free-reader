//! Fast EPUB metadata and cover extraction (reads only container.xml, the OPF and the cover image).
//!
//! Other formats are enriched by the frontend via foliate-js after import.

use crate::db::Metadata;
use percent_encoding::percent_decode_str;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use std::io::{Read, Seek};

#[derive(Debug, thiserror::Error)]
pub enum EpubError {
    #[error("not a valid EPUB archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("malformed EPUB XML: {0}")]
    Xml(#[from] quick_xml::Error),
    #[error("EPUB is missing {0}")]
    Missing(&'static str),
}

#[derive(Debug, Default)]
pub struct Extracted {
    pub meta: Metadata,
    pub cover: Option<Vec<u8>>,
}

pub fn extract<R: Read + Seek>(reader: R) -> Result<Extracted, EpubError> {
    let mut zip = zip::ZipArchive::new(reader)?;
    let container = read_entry(&mut zip, "META-INF/container.xml")?
        .ok_or(EpubError::Missing("META-INF/container.xml"))?;
    let opf_path = find_rootfile(&container)?.ok_or(EpubError::Missing("a package document"))?;
    let opf = read_entry(&mut zip, &opf_path)?.ok_or(EpubError::Missing("its package document"))?;
    let pkg = parse_opf(&opf)?;

    let cover = match pkg.cover_href {
        Some(href) => read_entry(&mut zip, &resolve_href(&opf_path, &href))?,
        None => None,
    };
    Ok(Extracted {
        meta: pkg.meta,
        cover,
    })
}

fn read_entry<R: Read + Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
) -> Result<Option<Vec<u8>>, EpubError> {
    let mut file = match zip.by_name(name) {
        Ok(f) => f,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(e.into()),
    };
    let mut buf = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut buf)?;
    Ok(Some(buf))
}

/// Resolves a manifest href relative to the OPF's directory, handling `..` and %-escapes.
fn resolve_href(opf_path: &str, href: &str) -> String {
    let href = percent_decode_str(href.split('#').next().unwrap_or(href)).decode_utf8_lossy();
    let mut parts: Vec<&str> = opf_path.split('/').collect();
    parts.pop();
    for seg in href.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn local_name(e: &BytesStart) -> String {
    e.local_name().as_ref().to_string()
}

fn attr(e: &BytesStart, name: &str) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        (a.key.local_name().as_ref() == name)
            .then(|| a.normalized_value(XmlVersion::Explicit1_0).ok())
            .flatten()
            .map(|v| v.into_owned())
    })
}

fn find_rootfile(xml: &[u8]) -> Result<Option<String>, EpubError> {
    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf)? {
            Event::Start(e) | Event::Empty(e) if local_name(&e) == "rootfile" => {
                return Ok(attr(&e, "full-path"));
            }
            Event::Eof => return Ok(None),
            _ => {}
        }
        buf.clear();
    }
}

#[derive(Debug, Default)]
struct Package {
    meta: Metadata,
    cover_href: Option<String>,
}

struct ManifestItem {
    id: String,
    href: String,
    media_type: String,
    properties: String,
}

/// Which text node we're currently collecting.
enum Capture {
    Title,
    Creator {
        is_author: bool,
    },
    Language,
    Publisher,
    Description,
    /// EPUB 3 `<meta property=…>`; `refines` points at another element's id.
    Meta {
        property: String,
        id: Option<String>,
        refines: Option<String>,
    },
}

fn collapse_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_opf(xml: &[u8]) -> Result<Package, EpubError> {
    let mut reader = Reader::from_reader(xml);
    let mut buf = Vec::new();

    let mut title = None;
    let mut authors: Vec<String> = Vec::new();
    let mut language = None;
    let mut publisher = None;
    let mut description = None;
    let mut cover_id = None;
    let mut manifest: Vec<ManifestItem> = Vec::new();

    // Series, from Calibre's EPUB 2 metas or EPUB 3 belongs-to-collection.
    let mut calibre_series = None;
    let mut calibre_index = None;
    let mut collections: Vec<(Option<String>, String)> = Vec::new(); // (id, name)
    let mut refinements: Vec<(String, String, String)> = Vec::new(); // (refines id, property, value)

    let mut capture: Option<Capture> = None;
    let mut text = String::new();

    loop {
        let event = reader.read_event_into(&mut buf)?;
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                let is_empty = matches!(event, Event::Empty(_));
                match local_name(e).as_str() {
                    "title" => capture = Some(Capture::Title),
                    "creator" => {
                        let role = attr(e, "role");
                        capture = Some(Capture::Creator {
                            is_author: role.is_none_or(|r| r == "aut"),
                        })
                    }
                    "language" => capture = Some(Capture::Language),
                    "publisher" => capture = Some(Capture::Publisher),
                    "description" => capture = Some(Capture::Description),
                    "meta" => {
                        if let (Some(name), Some(content)) = (attr(e, "name"), attr(e, "content")) {
                            match name.as_str() {
                                "cover" => cover_id = Some(content),
                                "calibre:series" => calibre_series = Some(content),
                                "calibre:series_index" => calibre_index = content.parse().ok(),
                                _ => {}
                            }
                        } else if let Some(property) = attr(e, "property") {
                            capture = Some(Capture::Meta {
                                property,
                                id: attr(e, "id"),
                                refines: attr(e, "refines")
                                    .map(|r| r.trim_start_matches('#').to_string()),
                            });
                        }
                    }
                    "item" => manifest.push(ManifestItem {
                        id: attr(e, "id").unwrap_or_default(),
                        href: attr(e, "href").unwrap_or_default(),
                        media_type: attr(e, "media-type").unwrap_or_default(),
                        properties: attr(e, "properties").unwrap_or_default(),
                    }),
                    _ => {}
                }
                if is_empty {
                    capture = None;
                }
                text.clear();
            }
            Event::Text(t) => {
                if capture.is_some() {
                    text.push_str(&t.xml10_content());
                }
            }
            Event::CData(t) => {
                if capture.is_some() {
                    text.push_str(&t);
                }
            }
            Event::GeneralRef(r) => {
                if capture.is_some() {
                    if let Ok(Some(c)) = r.resolve_char_ref() {
                        text.push(c);
                    } else {
                        if let Some(s) = quick_xml::escape::resolve_predefined_entity(&r) {
                            text.push_str(s);
                        }
                    }
                }
            }
            Event::End(_) => {
                if let Some(c) = capture.take() {
                    let value = collapse_ws(&text);
                    if !value.is_empty() {
                        match c {
                            Capture::Title => {
                                title.get_or_insert(value);
                            }
                            Capture::Creator { is_author } => {
                                if is_author {
                                    authors.push(value)
                                }
                            }
                            Capture::Language => {
                                language.get_or_insert(value);
                            }
                            Capture::Publisher => {
                                publisher.get_or_insert(value);
                            }
                            Capture::Description => {
                                // Keep paragraph structure; descriptions often contain HTML.
                                description.get_or_insert(text.trim().to_string());
                            }
                            Capture::Meta {
                                property,
                                id,
                                refines,
                            } => match (property.as_str(), refines) {
                                ("belongs-to-collection", None) => collections.push((id, value)),
                                (_, Some(target)) => refinements.push((target, property, value)),
                                _ => {}
                            },
                        }
                    }
                }
                text.clear();
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }

    // Prefer an EPUB 3 collection (unless typed as something other than a series) over Calibre's.
    let refined = |id: &Option<String>, prop: &str| {
        id.as_ref().and_then(|id| {
            refinements
                .iter()
                .find(|(t, p, _)| t == id && p == prop)
                .map(|(_, _, v)| v.clone())
        })
    };
    let epub3_series = collections
        .iter()
        .find(|(id, _)| refined(id, "collection-type").is_none_or(|t| t == "series"))
        .map(|(id, name)| {
            (
                name.clone(),
                refined(id, "group-position").and_then(|p| p.parse().ok()),
            )
        });
    let (series, series_index) = match epub3_series {
        Some((name, idx)) => (Some(name), idx),
        None => (calibre_series, calibre_index),
    };

    let cover_href = manifest
        .iter()
        .find(|i| i.properties.split_whitespace().any(|p| p == "cover-image"))
        .or_else(|| {
            cover_id
                .as_ref()
                .and_then(|cid| manifest.iter().find(|i| &i.id == cid))
        })
        .or_else(|| {
            manifest.iter().find(|i| {
                i.media_type.starts_with("image/")
                    && (i.id.to_lowercase().contains("cover")
                        || i.href.to_lowercase().contains("cover"))
            })
        })
        .filter(|i| i.media_type.starts_with("image/"))
        .map(|i| i.href.clone());

    Ok(Package {
        meta: Metadata {
            title,
            authors: (!authors.is_empty()).then(|| authors.join(" & ")),
            series,
            series_index,
            language,
            publisher,
            description,
        }
        .normalized(),
        cover_href,
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::io::{Cursor, Write};

    /// Builds a minimal EPUB in memory with the given OPF and extra files.
    pub fn build_epub(opf: &str, files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        let mut zip = zip::ZipWriter::new(&mut out);
        let opts = zip::write::SimpleFileOptions::default();
        zip.start_file("mimetype", opts).unwrap();
        zip.write_all(b"application/epub+zip").unwrap();
        zip.start_file("META-INF/container.xml", opts).unwrap();
        zip.write_all(
            br#"<?xml version="1.0"?>
            <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
              <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
            </container>"#,
        )
        .unwrap();
        zip.start_file("OEBPS/content.opf", opts).unwrap();
        zip.write_all(opf.as_bytes()).unwrap();
        for (name, data) in files {
            zip.start_file(*name, opts).unwrap();
            zip.write_all(data).unwrap();
        }
        zip.finish().unwrap();
        out.into_inner()
    }

    #[test]
    fn extracts_epub3_metadata_series_and_cover() {
        let opf = r##"<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>  The   Fellowship &amp; Ring </dc:title>
            <dc:title>Subtitle</dc:title>
            <dc:creator id="c1">J. R. R. Tolkien</dc:creator>
            <dc:creator id="c2">Second Author</dc:creator>
            <dc:language>en-GB</dc:language>
            <dc:publisher>Allen &#38; Unwin</dc:publisher>
            <dc:description><![CDATA[<p>First</p>]]></dc:description>
            <meta property="belongs-to-collection" id="s1">The Lord of the Rings</meta>
            <meta refines="#s1" property="collection-type">series</meta>
            <meta refines="#s1" property="group-position">1</meta>
          </metadata>
          <manifest>
            <item id="img" href="images/My%20Cover.jpg" media-type="image/jpeg" properties="cover-image"/>
          </manifest>
        </package>"##;
        let epub = build_epub(opf, &[("OEBPS/images/My Cover.jpg", b"JPEGDATA")]);
        let x = extract(Cursor::new(epub)).unwrap();
        assert_eq!(x.meta.title.as_deref(), Some("The Fellowship & Ring"));
        assert_eq!(
            x.meta.authors.as_deref(),
            Some("J. R. R. Tolkien & Second Author")
        );
        assert_eq!(x.meta.language.as_deref(), Some("en-GB"));
        assert_eq!(x.meta.publisher.as_deref(), Some("Allen & Unwin"));
        assert_eq!(x.meta.description.as_deref(), Some("<p>First</p>"));
        assert_eq!(x.meta.series.as_deref(), Some("The Lord of the Rings"));
        assert_eq!(x.meta.series_index, Some(1.0));
        assert_eq!(x.cover.as_deref(), Some(&b"JPEGDATA"[..]));
    }

    #[test]
    fn extracts_epub2_calibre_series_and_meta_cover() {
        let opf = r#"<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="2.0">
          <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
            <dc:title>Dune</dc:title>
            <dc:creator opf:role="aut">Frank Herbert</dc:creator>
            <dc:creator opf:role="ill">An Illustrator</dc:creator>
            <meta name="cover" content="cov"/>
            <meta name="calibre:series" content="Dune Chronicles"/>
            <meta name="calibre:series_index" content="1.5"/>
          </metadata>
          <manifest>
            <item id="cov" href="../cover.png" media-type="image/png"/>
          </manifest>
        </package>"#;
        let epub = build_epub(opf, &[("cover.png", b"PNG")]);
        let x = extract(Cursor::new(epub)).unwrap();
        assert_eq!(x.meta.authors.as_deref(), Some("Frank Herbert"));
        assert_eq!(x.meta.series.as_deref(), Some("Dune Chronicles"));
        assert_eq!(x.meta.series_index, Some(1.5));
        assert_eq!(x.cover.as_deref(), Some(&b"PNG"[..]));
    }

    #[test]
    fn missing_cover_and_metadata_are_none() {
        let opf = r#"<package><metadata/><manifest>
            <item id="x" href="ch1.xhtml" media-type="application/xhtml+xml"/>
        </manifest></package>"#;
        let x = extract(Cursor::new(build_epub(opf, &[]))).unwrap();
        assert_eq!(x.meta, Metadata::default());
        assert!(x.cover.is_none());
    }

    #[test]
    fn rejects_non_epub() {
        assert!(extract(Cursor::new(b"not a zip".to_vec())).is_err());
    }

    #[test]
    fn resolves_relative_hrefs() {
        assert_eq!(
            resolve_href("OEBPS/content.opf", "img/a.jpg"),
            "OEBPS/img/a.jpg"
        );
        assert_eq!(resolve_href("OEBPS/content.opf", "../a%20b.jpg"), "a b.jpg");
        assert_eq!(resolve_href("content.opf", "./x.png#frag"), "x.png");
    }
}
