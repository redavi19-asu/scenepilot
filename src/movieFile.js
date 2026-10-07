import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function asBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not save this video chunk."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

export async function movieFileSink(filename, mimeType) {
  if (Capacitor.isNativePlatform()) {
    const path = `director-exports/${filename}`;
    await Filesystem.writeFile({ path, directory: Directory.Cache, data: "", recursive: true });
    return {
      write: async blob => Filesystem.appendFile({ path, directory: Directory.Cache, data: await asBase64(blob) }),
      finish: async () => ({ filename, uri: (await Filesystem.getUri({ path, directory: Directory.Cache })).uri, native: true }),
      abort: () => Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {})
    };
  }
  const chunks = [];
  let size = 0;
  return {
    write: async blob => {
      size += blob.size;
      if (size > 256 * 1024 * 1024) throw new Error("This browser export reached 256 MB. Split the timeline into shorter exports.");
      chunks.push(blob);
    },
    finish: async () => ({ filename, url: URL.createObjectURL(new Blob(chunks, { type: mimeType })), native: false }),
    abort: async () => { chunks.length = 0; }
  };
}

export async function shareMovie(file) {
  return Share.share({ title: "Urban Director Studio video", files: [file.uri], dialogTitle: "Save or share your video" });
}
