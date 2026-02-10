use std::io::{Read, Seek};
use std::path::Path;
use zip::ZipArchive;

pub fn extract_zip<R: Read + Seek>(data: R, dest: &Path) -> anyhow::Result<()> {
    let mut archive = ZipArchive::new(data)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;

        // ZIP Slip vulnerability protection
        // Enforce that the file path is safe and contained within destination
        let file_path = match file.enclosed_name() {
            Some(path) => path.to_owned(),
            None => continue, // Skip potentially malicious paths
        };

        let outpath = dest.join(&file_path);

        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }

    Ok(())
}
