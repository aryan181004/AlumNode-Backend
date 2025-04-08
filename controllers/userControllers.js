require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../config/db.js");
const generateUserToken = require("../utils/generateUserToken");

const signup = async (req, res) => {
  var {
    first_name,
    last_name,
    mobile_number,
    college_email,
    is_alumini, // Correct spelling
    email,
    password,
  } = req.body;

  try {
    const timestamp = new Date();

    const hashedPassword = await bcrypt.hash(
      password,
      Number(process.env.SALT)
    );

    if (!is_alumini) {
      is_alumini = false;
    }

    const userQuery = `INSERT INTO users 
    (first_name, last_name, mobile_number, college_email, is_alumini, email, password, created_at) 
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`;
    const userQueryParams = [
      first_name,
      last_name,
      mobile_number,
      college_email,
      is_alumini,
      email,
      hashedPassword,
      timestamp,
    ];
    const userQueryData = await pool.query(userQuery, userQueryParams);
    const token = await generateUserToken(userQueryData.rows[0].id);
    delete userQueryData.password;

    res.status(201).json({
      error: false,
      message: "Signup Successful. Welcome aboard!",
      data: {
        token,
        user: userQueryData.rows[0],
      },
    });
  } catch (err) {
    if (err.code === "23505") {
      res.status(400).json({
        error: true,
        message:
          "User with this details already exists! Please use a different email or phone number to create your account.",
      });
    } else {
      console.log(err);
      res.status(500).json({ error: true, message: "Internal Server Error!" });
    }
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: true, message: "All fields are required!" });
  }

  try {
    const userQuery = `SELECT * FROM users WHERE email = $1`;
    const userQueryParams = [email];
    const userQueryData = await pool.query(userQuery, userQueryParams);

    if (userQueryData.rowCount === 1) {
      const auth = await bcrypt.compare(
        password,
        userQueryData.rows[0].password
      );
      if (auth) {
        const token = await generateUserToken(userQueryData.rows[0].id);
        const user = userQueryData.rows[0];
        delete user.password;
        delete user.created_at;
        res.status(200).json({
          error: false,
          message: "Login Successful. Welcome back!",
          data: {
            token,
            user,
          },
        });
      } else {
        res.status(400).json({
          error: true,
          message:
            "Please ensure you've entered the correct password and try again.",
        });
      }
    } else {
      res.status(404).json({
        error: true,
        message:
          "The provided email does not match any existing user account. Please verify your credentials or consider signing up if you do not have an account.",
      });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: "Internal Server Error!" });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.token;
    const query = `DELETE FROM user_token WHERE token = $1`;
    const queryParams = [token];
    const queryData = await pool.query(query, queryParams);

    res
      .status(200)
      .json({ error: false, message: "Logout Successful. Have a great day!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: true, message: "Internal server error!" });
  }
};

module.exports = {
  signup,
  login,
  logout,
};
