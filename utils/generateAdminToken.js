require("dotenv").config();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

const generateAdminToken = async (adminId) => {
  try {
    const timestamp = new Date();
    const token = jwt.sign({ id: adminId }, process.env.TOKEN_SECRET, {
      expiresIn: "1h",
    });
    const query = `INSERT INTO admin_token (token, fk_admin, created_at) VALUES ($1, $2, $3)`;
    const queryParams = [token, adminId, timestamp];

    await pool.query(query, queryParams);

    return token;
  } catch (err) {
    throw new Error(err);
  }
};

module.exports = generateAdminToken;
