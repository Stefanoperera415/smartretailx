const productRepository = require("../repositories/productRepository");

async function getProducts(req, res, next) {
  try {
    const products = await productRepository.findAll();
    return res.status(200).json({ data: products });
  } catch (error) {
    next(error);
  }
}

async function getProductById(req, res, next) {
  try {
    const product = await productRepository.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.status(200).json({ data: product });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  const {
    name,
    categoryId,
    description,
    price,
    currency = "GBP",
    imageUrl,
    status = "ACTIVE"
  } = req.body;

  // Validation
  if (!name || !categoryId || !description || price === undefined) {
    return res.status(400).json({
      error: "name, categoryId, description and price are required"
    });
  }
  if (typeof price !== "number" || price < 0) {
    return res.status(400).json({
      error: "price must be a non-negative number"
    });
  }

  try {
    // ✅ Use dedicated findByName instead of loading all products
    const existingProduct = await productRepository.findByName(name);
    if (existingProduct) {
      return res.status(409).json({
        error: "A product with this name already exists"
      });
    }

    const now = new Date().toISOString();
    const newProduct = {
      productId: `P${Date.now()}`,
      name,
      categoryId,
      description,
      price,
      currency,
      imageUrl: imageUrl || null,
      status,
      createdAt: now,
      updatedAt: now
    };

    const createdProduct = await productRepository.create(newProduct);
    return res.status(201).json({ data: createdProduct });
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  try {
    const existingProduct = await productRepository.findById(req.params.productId);
    if (!existingProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    const allowedFields = [
      "name",
      "categoryId",
      "description",
      "price",
      "currency",
      "imageUrl",
      "status"
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.price !== undefined && (typeof updates.price !== "number" || updates.price < 0)) {
      return res.status(400).json({
        error: "price must be a non-negative number"
      });
    }

    const updatedProduct = await productRepository.update(req.params.productId, updates);
    return res.status(200).json({ data: updatedProduct });
  } catch (error) {
    next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const deleted = await productRepository.remove(req.params.productId);
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
  deleteProduct
};