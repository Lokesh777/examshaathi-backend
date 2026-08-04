const ImageKit = require("@imagekit/nodejs");

let client = null;

const getClient = () => {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY not configured");
  }
  if (!client) {
    client = new ImageKit({ privateKey });
  }
  return client;
};

const isImageKitConfigured = () => Boolean(process.env.IMAGEKIT_PRIVATE_KEY?.trim());

const extFromMime = (mimetype = "") => {
  if (mimetype.includes("png")) return "png";
  if (mimetype.includes("webp")) return "webp";
  if (mimetype.includes("gif")) return "gif";
  if (mimetype.includes("jpeg") || mimetype.includes("jpg")) return "jpg";
  return "png";
};

/**
 * Upload image buffer to ImageKit CDN.
 * @returns {Promise<string>} public URL
 */
const uploadPngBuffer = async (buffer, fileName) => {
  const ik = getClient();
  const result = await ik.files.upload({
    file: buffer,
    fileName,
    useUniqueFileName: true,
    folder: "/examsaathi/contact",
  });
  const url = result.url || result.fileUrl || result.thumbnailUrl;
  if (!url) {
    throw new Error("ImageKit upload returned no URL");
  }
  return url;
};

/**
 * Upload a multer memory file (any image mime) to ImageKit.
 * Uses data-URI so JPG/WebP/PNG all work reliably.
 */
const uploadFromMulterFile = async (file, fileName) => {
  if (!file?.buffer) throw new Error("No file buffer");
  const mime = file.mimetype || "image/png";
  const base = (fileName || `upload.${extFromMime(mime)}`).replace(/\\/g, "/");
  const withExt = /\.[a-z0-9]+$/i.test(base)
    ? base
    : `${base}.${extFromMime(mime)}`;

  const ik = getClient();
  const dataUri = `data:${mime};base64,${file.buffer.toString("base64")}`;
  const result = await ik.files.upload({
    file: dataUri,
    fileName: withExt.split("/").pop(),
    useUniqueFileName: true,
    folder: "/examsaathi/contact",
  });
  const url = result.url || result.fileUrl || result.thumbnailUrl;
  if (!url) {
    throw new Error("ImageKit upload returned no URL");
  }
  return url;
};

module.exports = {
  isImageKitConfigured,
  uploadPngBuffer,
  uploadFromMulterFile,
};
