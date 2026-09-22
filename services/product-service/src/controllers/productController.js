const productRepository = require("../repositories/productRepository");
const categoryRepository = require("../repositories/categoryRepository");
const s3Service = require("../services/s3Service");
const { publishEvent } = require("../config/eventbridge");
const path = require("path");

/**
 * Publish EventBridge event with retry (3 attempts, exponential backoff)
 */
async function publishEventWithRetry(eventType, data, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await publishEvent(eventType, data);
      console.log(`✅ Published ${eventType} event (attempt ${attempt})`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ Event publish attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`❌ Failed to publish ${eventType} after ${maxAttempts} attempts:`, lastError);
}

/**
 * Enrich products with signed S3 URLs if imageUrl is a key
 */
async function enrichProductsWithSignedUrls(products) {
  const enriched = [];
  for (const product of products) {
    if (product.imageUrl && product.imageUrl.startsWith("products/")) {
      try {
        const signedUrl = await s3Service.generateSignedUrl(product.imageUrl);
        enriched.push({ ...product, imageUrl: signedUrl });
      } catch (error) {
        console.error(`Failed to generate signed URL for ${product.productId}:`, error);
        enriched.push(product);
      }
    } else {
      enriched.push(product);
    }
  }
  return enriched;
}

// GET /api/v1/products
async function getProducts(req, res, next) {
  try {
    let products = await productRepository.findAll();
    products = await enrichProductsWithSignedUrls(products);
    return res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/products/:productId
async function getProductById(req, res, next) {
  try {
    let product = await productRepository.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (product.imageUrl && product.imageUrl.startsWith("products/")) {
      try {
        const signedUrl = await s3Service.generateSignedUrl(product.imageUrl);
        product = { ...product, imageUrl: signedUrl };
      } catch (error) {
        console.error(`Failed to generate signed URL for ${product.productId}:`, error);
      }
    }
    return res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/products (multipart/form-data)
async function createProduct(req, res, next) {
  try {
    const {
      name,
      categoryId,
      description,
      price,
      currency = "LKR",
      status = "ACTIVE",
      initialStock,
      warehouseId,
    } = req.body;

    // Validate required fields
    if (!name || !categoryId || !description || price === undefined) {
      return res.status(400).json({
        error: "name, categoryId, description and price are required",
      });
    }

    // Validate category exists
    const category = await categoryRepository.findById(categoryId);
    if (!category) {
      return res.status(400).json({ error: "Category does not exist" });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({
        error: "price must be a non-negative number",
      });
    }

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({
        error: "status must be ACTIVE or INACTIVE",
      });
    }

    // Check duplicate name
    const existing = await productRepository.findByName(name);
    if (existing) {
      return res.status(409).json({
        error: "A product with this name already exists",
      });
    }

    // Process image if provided
    let imageKey = null;
    if (req.file) {
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname);
      imageKey = `products/${Date.now()}/${timestamp}${ext}`;
      await s3Service.uploadFile(req.file.buffer, imageKey, req.file.mimetype);
    }

    const now = new Date().toISOString();
    const newProduct = {
      productId: `P${Date.now()}`,
      name: name.trim(),
      categoryId: categoryId.trim(),
      description: description.trim(),
      price: priceNum,
      currency: currency.toUpperCase(),
      imageUrl: imageKey,
      status,
      createdAt: now,
      updatedAt: now,
    };

    const created = await productRepository.create(newProduct);

    // ----- Publish ProductCreated event with retry -----
    const stock = initialStock !== undefined ? Number(initialStock) : 0;
    // ✅ Keep warehouseId as provided (null if not set) – let inventory decide
    const whId = (warehouseId && warehouseId.trim() !== "") ? warehouseId.trim() : null;

    publishEventWithRetry("ProductCreated", {
      productId: created.productId,
      name: created.name,
      categoryId: created.categoryId,
      description: created.description,
      price: created.price,
      currency: created.currency,
      imageUrl: created.imageUrl,
      status: created.status,
      initialStock: stock,
      warehouseId: whId, // forward as-is
    }).catch((error) => {
      // already logged inside function
    });

    let responseProduct = created;
    if (imageKey) {
      try {
        const signedUrl = await s3Service.generateSignedUrl(imageKey);
        responseProduct = { ...created, imageUrl: signedUrl };
      } catch (error) {
        console.error("Failed to generate signed URL for new product:", error);
      }
    }

    return res.status(201).json({ data: responseProduct });
  } catch (error) {
    next(error);
  }
}

// PUT /api/v1/products/:productId
async function updateProduct(req, res, next) {
  try {
    const productId = req.params.productId;
    const existing = await productRepository.findById(productId);
    if (!existing) {
      return res.status(404).json({ error: "Product not found" });
    }

    const {
      name,
      categoryId,
      description,
      price,
      currency,
      status,
      removeImage,
    } = req.body;

    const updates = {};

    // Validate and sanitise text fields
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      updates.name = name.trim();
    }

    if (categoryId !== undefined) {
      if (typeof categoryId !== "string" || !categoryId.trim()) {
        return res.status(400).json({ error: "categoryId must be a non-empty string" });
      }
      const category = await categoryRepository.findById(categoryId);
      if (!category) {
        return res.status(400).json({ error: "Category does not exist" });
      }
      updates.categoryId = categoryId.trim();
    }

    if (description !== undefined) {
      if (typeof description !== "string" || !description.trim()) {
        return res.status(400).json({ error: "description must be a non-empty string" });
      }
      updates.description = description.trim();
    }

    if (price !== undefined) {
      const priceNum = Number(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: "price must be a non-negative number" });
      }
      updates.price = priceNum;
    }

    if (currency !== undefined) {
      if (typeof currency !== "string" || !currency.trim()) {
        return res.status(400).json({ error: "currency must be a non-empty string" });
      }
      updates.currency = currency.trim().toUpperCase();
    }

    if (status !== undefined) {
      if (!["ACTIVE", "INACTIVE"].includes(status)) {
        return res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
      }
      updates.status = status;
    }

    // ---- Handle image ----
    const shouldRemoveImage =
      removeImage === "true" || removeImage === true || removeImage === "1";

    if (req.file) {
      const timestamp = Date.now();
      const ext = path.extname(req.file.originalname);
      const imageKey = `products/${productId}/${timestamp}${ext}`;

      await s3Service.uploadFile(req.file.buffer, imageKey, req.file.mimetype);

      if (existing.imageUrl && existing.imageUrl.startsWith("products/")) {
        try {
          await s3Service.deleteFile(existing.imageUrl);
          console.log(`Deleted old image ${existing.imageUrl} from S3`);
        } catch (error) {
          console.warn(`⚠️ Failed to delete old image ${existing.imageUrl}: ${error.message}`);
        }
      }

      updates.imageUrl = imageKey;
    } else if (shouldRemoveImage) {
      if (existing.imageUrl && existing.imageUrl.startsWith("products/")) {
        try {
          await s3Service.deleteFile(existing.imageUrl);
          console.log(`Deleted image ${existing.imageUrl} from S3`);
        } catch (error) {
          console.warn(`⚠️ Failed to delete image ${existing.imageUrl}: ${error.message}`);
        }
      }
      updates.imageUrl = null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    if (updates.name && updates.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await productRepository.findByName(updates.name);
      if (duplicate) {
        return res.status(409).json({ error: "A product with this name already exists" });
      }
    }

    const updated = await productRepository.update(productId, updates);

    let responseProduct = updated;
    if (updated.imageUrl && updated.imageUrl.startsWith("products/")) {
      try {
        const signedUrl = await s3Service.generateSignedUrl(updated.imageUrl);
        responseProduct = { ...updated, imageUrl: signedUrl };
      } catch (error) {
        console.error(`Failed to generate signed URL for ${productId}:`, error);
      }
    }

    return res.status(200).json({ data: responseProduct });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/v1/products/:productId
async function deleteProduct(req, res, next) {
  try {
    const productId = req.params.productId;
    const product = await productRepository.findById(productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (product.imageUrl && product.imageUrl.startsWith("products/")) {
      try {
        await s3Service.deleteFile(product.imageUrl);
        console.log(`Deleted image ${product.imageUrl} from S3`);
      } catch (error) {
        console.warn(`⚠️ Failed to delete image ${product.imageUrl}: ${error.message}`);
      }
    }

    const deleted = await productRepository.remove(productId);
    if (!deleted) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};

