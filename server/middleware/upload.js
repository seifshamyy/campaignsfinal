import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only CSV and Excel files are allowed"), false);
  }
}

export const uploadFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const imageStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const name = req.body.type || "asset";
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${name}${ext}`);
  },
});

export const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});
