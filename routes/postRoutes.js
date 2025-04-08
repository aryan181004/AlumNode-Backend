const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middlewares/userMiddlewares");
const {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  toggleLike,
  addComment,
  deleteComment,
} = require("../controllers/postControllers");

// Post routes
router.post("/", isAuthenticated, createPost);
router.get("/", isAuthenticated, getAllPosts);
router.get("/:id", isAuthenticated, getPostById);
router.put("/:id", isAuthenticated, updatePost);
router.delete("/:id", isAuthenticated, deletePost);

// Like routes
router.post("/:id/like", isAuthenticated, toggleLike);

// Comment routes
router.post("/:id/comment", isAuthenticated, addComment);
router.delete("/comment/:id", isAuthenticated, deleteComment);

module.exports = router;
