const express = require('express');
const {
  getCustomerProducts,
  getCustomerProductById
} = require('../controllers/product.controller');

const router = express.Router();

// Public / Customer facing catalog routes (Returns ONLY status = 'approved')
router.get('/', getCustomerProducts);
router.get('/:productId', getCustomerProductById);

module.exports = router;
