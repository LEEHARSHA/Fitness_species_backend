const { ObjectId } = require('mongodb');
const { getDb } = require('../config/mongodb');

const ALLOWED_CATEGORIES = [
  'Supplements',
  'Medicines / Wellness',
  'Gym Wear',
  'Fitness Equipment',
  'Footwear',
  'Snacks'
];

function formatProductResponse(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    sellerId: doc.sellerId,
    name: doc.name || '',
    description: doc.description || '',
    shortDescription: doc.shortDescription || '',
    category: doc.category || '',
    subCategory: doc.subCategory || '',
    brand: doc.brand || 'Fitness Species',
    sku: doc.sku || '',
    price: doc.price || 0.0,
    compareAtPrice: doc.compareAtPrice || null,
    discountPercent: doc.discountPercent || 0,
    images: doc.images || [],
    stock: doc.stock || 0,
    lowStockThreshold: doc.lowStockThreshold ?? 10,
    variants: doc.variants || [],
    specifications: doc.specifications || {},
    status: doc.status || 'pending',
    rejectionReason: doc.rejectionReason || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    approvedAt: doc.approvedAt || null,
    rejectedAt: doc.rejectedAt || null
  };
}

/**
 * @route   POST /api/seller/products
 * @desc    Submit a new product for admin approval
 * @access  Private (Seller/Admin Role Required)
 */
const createSellerProduct = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const {
      name,
      description,
      shortDescription,
      category,
      subCategory,
      brand,
      sku,
      price,
      compareAtPrice,
      stock,
      lowStockThreshold,
      images,
      variants,
      specifications
    } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required and must be at least 2 characters.'
      });
    }

    if (!category || !ALLOWED_CATEGORIES.includes(category.trim())) {
      return res.status(400).json({
        success: false,
        message: `Category is required and must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`
      });
    }

    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a positive number greater than 0.'
      });
    }

    const parsedStock = Number(stock);
    if (isNaN(parsedStock) || parsedStock < 0 || !Number.isInteger(parsedStock)) {
      return res.status(400).json({
        success: false,
        message: 'Stock must be a non-negative integer.'
      });
    }

    const parsedLowStockThreshold = lowStockThreshold === undefined
      ? 10
      : Number(lowStockThreshold);
    if (!Number.isInteger(parsedLowStockThreshold) || parsedLowStockThreshold < 0) {
      return res.status(400).json({
        success: false,
        message: 'Low-stock threshold must be a non-negative integer.'
      });
    }

    const parsedCompareAtPrice = compareAtPrice ? Number(compareAtPrice) : null;
    const discountPercent = parsedCompareAtPrice && parsedCompareAtPrice > parsedPrice
      ? Math.round(((parsedCompareAtPrice - parsedPrice) / parsedCompareAtPrice) * 100)
      : 0;

    const productDoc = {
      sellerId: userId,
      name: name.trim(),
      description: description ? String(description).trim() : '',
      shortDescription: shortDescription ? String(shortDescription).trim() : '',
      category: category.trim(),
      subCategory: subCategory ? String(subCategory).trim() : '',
      brand: brand ? String(brand).trim() : 'Fitness Species',
      sku: sku ? String(sku).trim() : `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      price: parsedPrice,
      compareAtPrice: parsedCompareAtPrice,
      discountPercent: discountPercent,
      images: Array.isArray(images) ? images : [],
      stock: parsedStock,
      lowStockThreshold: parsedLowStockThreshold,
      variants: Array.isArray(variants) ? variants : [],
      specifications: typeof specifications === 'object' && specifications !== null ? specifications : {},
      status: 'pending', // FORCED! Clients CANNOT set status to 'approved'
      rejectionReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      approvedAt: null,
      rejectedAt: null
    };

    const result = await db.collection('products').insertOne(productDoc);
    productDoc._id = result.insertedId;

    return res.status(201).json({
      success: true,
      product: formatProductResponse(productDoc)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/seller/products
 * @desc    Get all products submitted by the authenticated seller
 * @access  Private (Seller/Admin Role Required)
 */
const getSellerProducts = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;
    const { status } = req.query;

    const query = { sellerId: userId };
    if (status) {
      query.status = String(status).trim();
    }

    const products = await db
      .collection('products')
      .find(query)
      .sort({ updatedAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: products.length,
      products: products.map(formatProductResponse)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/seller/products/:productId
 * @desc    Get single product by ID for authenticated seller
 * @access  Private (Seller/Admin Role Required)
 */
const getSellerProductById = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;
    const { productId } = req.params;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    const product = await db.collection('products').findOne({
      _id: new ObjectId(productId),
      sellerId: userId
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied.'
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProductResponse(product)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/seller/products/:productId
 * @desc    Update a seller product. Forces status back to 'pending' for re-approval.
 * @access  Private (Seller/Admin Role Required)
 */
const updateSellerProduct = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;
    const { productId } = req.params;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    const {
      name,
      description,
      category,
      subCategory,
      brand,
      sku,
      price,
      compareAtPrice,
      stock,
      images,
      variants,
      specifications
    } = req.body || {};

    const updateFields = {
      status: 'pending', // Re-submitting edits forces status back to pending
      rejectionReason: null,
      approvedAt: null,
      rejectedAt: null,
      updatedAt: new Date()
    };

    if (name !== undefined) updateFields.name = String(name).trim();
    if (description !== undefined) updateFields.description = String(description).trim();
    if (category !== undefined) {
      if (!ALLOWED_CATEGORIES.includes(String(category).trim())) {
        return res.status(400).json({
          success: false,
          message: `Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`
        });
      }
      updateFields.category = String(category).trim();
    }
    if (subCategory !== undefined) updateFields.subCategory = String(subCategory).trim();
    if (brand !== undefined) updateFields.brand = String(brand).trim();
    if (sku !== undefined) updateFields.sku = String(sku).trim();

    if (price !== undefined) {
      const p = Number(price);
      if (isNaN(p) || p <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Price must be a positive number greater than 0.'
        });
      }
      updateFields.price = p;
    }

    if (stock !== undefined) {
      const s = Number(stock);
      if (isNaN(s) || s < 0 || !Number.isInteger(s)) {
        return res.status(400).json({
          success: false,
          message: 'Stock must be a non-negative integer.'
        });
      }
      updateFields.stock = s;
    }

    if (images !== undefined && Array.isArray(images)) updateFields.images = images;
    if (variants !== undefined && Array.isArray(variants)) updateFields.variants = variants;
    if (specifications !== undefined && typeof specifications === 'object') updateFields.specifications = specifications;

    const updated = await db.collection('products').findOneAndUpdate(
      { _id: new ObjectId(productId), sellerId: userId },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or unauthorized.'
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProductResponse(updated)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/seller/products/:productId/stock
 * @desc    Update only the stock count for a product owned by the authenticated seller
 * @access  Private (Seller/Admin Role Required)
 */
const updateSellerProductStock = async (req, res, next) => {
  try {
    const db = getDb();
    const { productId } = req.params;
    const stock = Number(req.body?.stock);

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock must be a non-negative integer.'
      });
    }

    const updated = await db.collection('products').findOneAndUpdate(
      { _id: new ObjectId(productId), sellerId: req.user.uid },
      { $set: { stock, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or access denied.'
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProductResponse(updated)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/products/pending
 * @desc    Get all pending products for admin review
 * @access  Private (Admin Role Required)
 */
const getPendingProducts = async (req, res, next) => {
  try {
    const db = getDb();

    const pending = await db
      .collection('products')
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: pending.length,
      products: pending.map(formatProductResponse)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/products/approved
 * @desc    Get all approved products for admin view
 * @access  Private (Admin Role Required)
 */
const getApprovedProductsForAdmin = async (req, res, next) => {
  try {
    const db = getDb();

    const approved = await db
      .collection('products')
      .find({ status: 'approved' })
      .sort({ updatedAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: approved.length,
      products: approved.map(formatProductResponse)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/products/rejected
 * @desc    Get all rejected products for admin view
 * @access  Private (Admin Role Required)
 */
const getRejectedProductsForAdmin = async (req, res, next) => {
  try {
    const db = getDb();

    const rejected = await db
      .collection('products')
      .find({ status: 'rejected' })
      .sort({ updatedAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: rejected.length,
      products: rejected.map(formatProductResponse)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/products/:productId
 * @desc    Get single product by ID for admin review
 * @access  Private (Admin Role Required)
 */
const getAdminProductById = async (req, res, next) => {
  try {
    const db = getDb();
    const { productId } = req.params;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    const product = await db.collection('products').findOne({ _id: new ObjectId(productId) });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    // Attach seller details if available
    const seller = await db.collection('sellers').findOne({ firebaseUid: product.sellerId });

    return res.status(200).json({
      success: true,
      product: {
        ...formatProductResponse(product),
        seller: seller ? {
          businessName: seller.businessName,
          ownerName: seller.ownerName,
          email: seller.email,
          phone: seller.phone
        } : null
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/products/:productId/approve
 * @desc    Approve a pending product for customer catalog
 * @access  Private (Admin Role Required)
 */
const approveProduct = async (req, res, next) => {
  try {
    const db = getDb();
    const { productId } = req.params;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    const product = await db.collection('products').findOneAndUpdate(
      { _id: new ObjectId(productId) },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date(),
          rejectionReason: null,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProductResponse(product)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/products/:productId/reject
 * @desc    Reject a pending product with a reason
 * @access  Private (Admin Role Required)
 */
const rejectProduct = async (req, res, next) => {
  try {
    const db = getDb();
    const { productId } = req.params;
    const { reason } = req.body || {};

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required.'
      });
    }

    const product = await db.collection('products').findOneAndUpdate(
      { _id: new ObjectId(productId) },
      {
        $set: {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectionReason: reason.trim(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.'
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProductResponse(product)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/users/:uid/role
 * @desc    Set application role for a user (admin operation)
 * @access  Private (Admin Role Required)
 */
const setUserRoleByAdmin = async (req, res, next) => {
  try {
    const db = getDb();
    const targetUid = req.params.uid;
    const { role } = req.body || {};

    const ALLOWED_ROLES = ['customer', 'seller', 'admin'];
    if (!role || !ALLOWED_ROLES.includes(String(role).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Role must be one of: ${ALLOWED_ROLES.join(', ')}.`
      });
    }

    const user = await db.collection('users').findOneAndUpdate(
      { firebaseUid: targetUid },
      { $set: { role: String(role).toLowerCase(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/products
 * @desc    Customer catalog endpoint. Returns ONLY approved products.
 * @access  Public / App
 */
const getCustomerProducts = async (req, res, next) => {
  try {
    const db = getDb();
    const { category, subCategory, brand, search, minPrice, maxPrice } = req.query;

    const query = { status: 'approved' }; // STRICT SECURITY REQUIREMENT!

    if (category) query.category = String(category).trim();
    if (subCategory) query.subCategory = String(subCategory).trim();
    if (brand) query.brand = String(brand).trim();

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (search) {
      query.$or = [
        { name: { $regex: String(search).trim(), $options: 'i' } },
        { description: { $regex: String(search).trim(), $options: 'i' } },
        { brand: { $regex: String(search).trim(), $options: 'i' } }
      ];
    }

    const products = await db
      .collection('products')
      .find(query)
      .sort({ updatedAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: products.length,
      products: products.map(formatProductResponse)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/products/:productId
 * @desc    Customer product detail endpoint. Returns product ONLY if approved.
 * @access  Public / App
 */
const getCustomerProductById = async (req, res, next) => {
  try {
    const db = getDb();
    const { productId } = req.params;

    if (!ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format.'
      });
    }

    const product = await db.collection('products').findOne({
      _id: new ObjectId(productId),
      status: 'approved' // STRICT SECURITY REQUIREMENT!
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available.'
      });
    }

    return res.status(200).json({
      success: true,
      product: formatProductResponse(product)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSellerProduct,
  getSellerProducts,
  getSellerProductById,
  updateSellerProduct,
  updateSellerProductStock,
  getPendingProducts,
  getApprovedProductsForAdmin,
  getRejectedProductsForAdmin,
  getAdminProductById,
  approveProduct,
  rejectProduct,
  setUserRoleByAdmin,
  getCustomerProducts,
  getCustomerProductById
};
