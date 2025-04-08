require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../config/db");
const generateAdminToken = require("../utils/generateAdminToken");

const createAdmin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required!" });
  }

  try {
    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.SALT)
    );

    const adminQuery = `INSERT INTO admins (username, password) VALUES ($1,$2)`;
    const adminQueryParams = [username, hashedPassword];
    const adminQueryData = await pool.query(adminQuery, adminQueryParams);

    res.status(201).json({
      error: false,
      message: "Admin Created Successfully.",
    });
  } catch (err) {
    if (err.code === "23505") {
      res.status(400).json({
        error: true,
        message: "Admin with this details already exists!",
      });
    } else {
      console.log(err);
      res.status(500).json({ error: true, message: "Internal Server Error!" });
    }
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required!" });
  }

  try {
    const adminQuery = `SELECT * FROM admins WHERE username = $1`;
    const adminQueryParams = [username];
    const adminQueryData = await pool.query(adminQuery, adminQueryParams);

    if (adminQueryData.rowCount === 1) {
      const auth = await bcrypt.compare(
        password,
        adminQueryData.rows[0].password
      );
      if (auth) {
        const token = await generateAdminToken(adminQueryData.rows[0].id);
        const admin = adminQueryData.rows[0];
        delete admin.password;
        res.status(200).json({
          error: false,
          message: "Admin Login Successful.",
          data: {
            token,
            admin,
          },
        });
      } else {
        res.status(400).json({
          error: true,
          message: "Password Not Correct!",
        });
      }
    } else {
      res.status(404).json({ error: true, message: "Admin Not Found!" });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.token;
    const query = `DELETE from admin_token WHERE token = $1`;
    const queryParams = [token];
    const queryData = await pool.query(query, queryParams);

    res.status(200).json({ error: false, message: "Logout Successfull." });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: "Internal server error!" });
  }
};

module.exports = { createAdmin, login, logout };
