const express = require("express");
const router = express.Router();

const { signup, login, logout } = require("../controllers/userControllers");

const {
  validateUserData,
  isAuthenticated,
} = require("../middlewares/userMiddlewares");

router.post("/signup", validateUserData, signup);
router.post("/login", login); // Removed isAuthenticated middleware
router.post("/logout", isAuthenticated, logout);

module.exports = router;
