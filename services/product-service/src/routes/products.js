const express = require("express");
const multer = require("multer");
const productController = require("../controllers/productController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET endpoints
router.get("/", productController.getProducts);
router.get("/:productId", productController.getProductById);

// POST – create product with image (multipart)
router.post("/", upload.single("image"), productController.createProduct);

// PUT / DELETE
router.put("/:productId", upload.single("image"), productController.updateProduct);
router.delete("/:productId", productController.deleteProduct);

module.exports = router;