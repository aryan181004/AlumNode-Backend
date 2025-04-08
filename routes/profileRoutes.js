const express = require("express");
const router = express.Router();
const { isAuthenticated } = require("../middlewares/userMiddlewares");
const {
  getUserProfile,
  getUserConnections,
} = require("../controllers/profileControllers");

// Profile routes
router.get("/connections", isAuthenticated, getUserConnections);
router.get("/:id", isAuthenticated, getUserProfile);
router.get("/", isAuthenticated, getUserProfile);

module.exports = router;
