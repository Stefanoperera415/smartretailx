const Product = require("../models/product");

async function findAll() {
  return Product.find()
    .sort({ createdAt: -1 })
    .lean();
}

async function findById(productId) {
  return Product.findOne({ productId }).lean();
}

async function findByName(name) {
  return Product.findOne({
    name: {
      $regex: `^${escapeRegex(name)}$`,
      $options: "i"
    }
  }).lean();
}

async function create(product) {
  const created = await Product.create(product);

  return created.toObject();
}

async function update(productId, updates) {
  return Product.findOneAndUpdate(
    { productId },
    updates,
    {
      new: true,
      runValidators: true
    }
  ).lean();
}

async function remove(productId) {
  const result = await Product.deleteOne({
    productId
  });

  return result.deletedCount > 0;
}

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

module.exports = {
  findAll,
  findById,
  findByName,
  create,
  update,
  remove
};