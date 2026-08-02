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

/**
 * Upload PNG buffer to ImageKit CDN.
 * @returns {Promise<string>} public URL
 */
const uploadPngBuffer = async (buffer, fileName) => {
  const ik = getClient();
  const result = await ik.files.upload({
    file: buffer,
    fileName,
    useUniqueFileName: true,
  });
  const url = result.url || result.fileUrl || result.thumbnailUrl;
  if (!url) {
    throw new Error("ImageKit upload returned no URL");
  }
  return url;
};

const uploadFromMulterFile = async (file, fileName) => {
  if (!file?.buffer) throw new Error("No file buffer");
  return uploadPngBuffer(file.buffer, fileName);
};

module.exports = {
  isImageKitConfigured,
  uploadPngBuffer,
  uploadFromMulterFile,
};
