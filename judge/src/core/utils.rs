use std::io::{Read, Seek, Write};
use std::path::Path;
use zip::ZipArchive;

const MAX_FILES: usize = 500;
const MAX_TOTAL_SIZE: u64 = 256 * 1024 * 1024; // 256MB
const MAX_FILE_SIZE: u64 = 64 * 1024 * 1024; // 64MB per file

pub fn extract_zip<R: Read + Seek>(data: R, dest: &Path) -> anyhow::Result<()> {
    let mut archive = ZipArchive::new(data)?;

    if archive.len() > MAX_FILES {
        anyhow::bail!(
            "ZIP contains too many files: {} (max {})",
            archive.len(),
            MAX_FILES
        );
    }

    let mut total_written: u64 = 0;

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

            // Copy with actual byte counting to guard against spoofed ZIP headers
            let mut file_written: u64 = 0;
            let mut buf = [0u8; 8192];
            loop {
                let n = file.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                file_written += n as u64;
                total_written += n as u64;

                if file_written > MAX_FILE_SIZE {
                    anyhow::bail!(
                        "File too large during extraction: {} (max {} bytes)",
                        file.name(),
                        MAX_FILE_SIZE
                    );
                }
                if total_written > MAX_TOTAL_SIZE {
                    anyhow::bail!(
                        "ZIP total decompressed size exceeds limit ({} bytes)",
                        MAX_TOTAL_SIZE
                    );
                }

                outfile.write_all(&buf[..n])?;
            }
        }
    }

    Ok(())
}
