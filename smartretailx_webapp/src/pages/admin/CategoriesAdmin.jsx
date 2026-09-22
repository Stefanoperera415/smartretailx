import { useEffect, useState } from "react";
import * as productService from "../../services/productService";
import LoadingSpinner from "../../components/LoadingSpinner";

const CategoriesAdmin = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [error, setError] = useState("");

  const fetchCategories = async () => {
    try {
      const res = await productService.getCategories();
      setCategories(res.data.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const resetForm = () => {
    setFormData({ name: "", description: "" });
    setEditingCategory(null);
    setError("");
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (editingCategory) {
        await productService.updateCategory(editingCategory.categoryId, formData);
      } else {
        await productService.createCategory(formData);
      }
      setShowModal(false);
      fetchCategories();
    } catch (err) {
      setError(err.response?.data?.error || "Failed to save category");
    }
  };

  const handleDelete = async (categoryId) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return;
    try {
      await productService.deleteCategory(categoryId);
      fetchCategories();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete category");
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error && !showModal) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Manage Categories</h1>
        <button onClick={openCreateModal} className="btn-primary">
          Add Category
        </button>
      </div>

      {/* Category List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">No categories yet.</td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr key={cat.categoryId}>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-800">{cat.categoryId}</td>
                    <td className="px-6 py-4 whitespace-nowrap">{cat.name}</td>
                    <td className="px-6 py-4">{cat.description || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => openEditModal(cat)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(cat.categoryId)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">
              {editingCategory ? "Edit Category" : "New Category"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="3"
                  className="input-field"
                />
              </div>
              {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">{error}</div>}
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingCategory ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesAdmin;