const categoryRepository = require("../repositories/categoryRepository");
const productRepository = require("../repositories/productRepository");

// GET /api/v1/categories
async function getCategories(req, res, next) {
  try {
    const categories = await categoryRepository.findAll();
    return res.status(200).json({ data: categories });
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/categories/:categoryId
async function getCategoryById(req, res, next) {
  try {
    const category = await categoryRepository.findById(req.params.categoryId);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    return res.status(200).json({ data: category });
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/categories
async function createCategory(req, res, next) {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Check duplicate name (simple scan)
    const all = await categoryRepository.findAll();
    if (all.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: "Category with this name already exists" });
    }

    const categoryId = `CAT${Date.now()}`;
    const newCategory = { categoryId, name: name.trim(), description: description?.trim() || "" };
    const created = await categoryRepository.create(newCategory);
    return res.status(201).json({ data: created });
  } catch (error) {
    next(error);
  }
}

// PUT /api/v1/categories/:categoryId
async function updateCategory(req, res, next) {
  try {
    const categoryId = req.params.categoryId;
    const existing = await categoryRepository.findById(categoryId);
    if (!existing) {
      return res.status(404).json({ error: "Category not found" });
    }

    const { name, description } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name must be a non-empty string" });
      }
      // Check duplicate name if changed
      if (name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        const all = await categoryRepository.findAll();
        if (all.some(cat => cat.name.toLowerCase() === name.trim().toLowerCase() && cat.categoryId !== categoryId)) {
          return res.status(409).json({ error: "Category with this name already exists" });
        }
      }
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = description.trim() || "";
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const updated = await categoryRepository.update(categoryId, updates);
    return res.status(200).json({ data: updated });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/v1/categories/:categoryId
async function deleteCategory(req, res, next) {
  try {
    const categoryId = req.params.categoryId;
    const existing = await categoryRepository.findById(categoryId);
    if (!existing) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Check if any product uses this category
    const allProducts = await productRepository.findAll();
    const inUse = allProducts.some(p => p.categoryId === categoryId);
    if (inUse) {
      return res.status(409).json({ error: "Cannot delete category because it is used by one or more products" });
    }

    const deleted = await categoryRepository.remove(categoryId);
    if (!deleted) {
      return res.status(404).json({ error: "Category not found" });
    }
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};