const express = require("express");
const router = express.Router();

const {
  createAdmin,
  login,
  logout,
} = require("../controllers/adminControllers");

const { isAdminAuthenticated } = require("../middlewares/adminMiddlewares");

router.post("/createAdmin", isAdminAuthenticated, createAdmin);
router.post("/login", isAdminAuthenticated, login);
router.post("/logout", isAdminAuthenticated, logout);

module.exports = router;
