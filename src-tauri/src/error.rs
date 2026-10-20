#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("couldn't read image: {0}")]
    Image(#[from] image::ImageError),
    #[error("unsupported file type: {0}")]
    Unsupported(String),
    #[error("book not found")]
    NotFound,
    #[error("{0}")]
    Invalid(String),
}

impl serde::Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
