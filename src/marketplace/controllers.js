import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import {
  adminProductQuerySchema,
  createProductSchema,
  createSellerProfileSchema,
  productReviewSchema,
  publicProductQuerySchema,
  sellerProductQuerySchema,
  updateProductSchema,
  updateProductStockSchema,
  updateSellerProfileSchema,
} from './validation.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function invalid(res, result) {
  res.status(400).json({
    success: false,
    message: result.error.issues[0]?.message || 'Request validation failed.',
    issues: result.error.issues.map(({ path, message }) => ({ path, message })),
  });
}

function validObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value) && ObjectId.isValid(value);
}

function sellerProductFilter(uid) {
  return {
    $or: [
      { sellerUid: uid },
      { sellerUid: { $exists: false }, sellerId: uid },
    ],
  };
}

function productImageUrl(image) {
  return typeof image === 'string'
    ? image
    : typeof image?.url === 'string'
      ? image.url
      : '';
}

function isSellerStorageImageUrl(value, uid) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'firebasestorage.googleapis.com'
      || url.port
      || url.username
      || url.password
      || url.searchParams.get('alt') !== 'media'
      || !url.searchParams.get('token')
    ) {
      return false;
    }

    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match || decodeURIComponent(match[1]) !== (
      process.env.FIREBASE_STORAGE_BUCKET || 'sellerportal-2786c.firebasestorage.app'
    )) {
      return false;
    }

    const objectPath = decodeURIComponent(match[2]).split('/');
    return objectPath.length === 4
      && objectPath[0] === 'sellers'
      && objectPath[1] === uid
      && objectPath[2] === 'products'
      && /^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(objectPath[3]);
  } catch {
    return false;
  }
}

function isValidNewSellerImageList(images, uid, existingImages = [], allowEmpty = false) {
  if (!Array.isArray(images) || (!allowEmpty && images.length === 0) || images.length > 30) return false;
  const existingUrls = new Set(
    (Array.isArray(existingImages) ? existingImages : []).map(productImageUrl).filter(Boolean),
  );
  return images.every((image) => (
    typeof image === 'string'
    && (existingUrls.has(image) || isSellerStorageImageUrl(image, uid))
  ));
}

function productResponse(product) {
  if (!product) return null;
  const id = product._id?.toString();
  return {
    ...product,
    images: (Array.isArray(product.images) ? product.images : [])
      .map(productImageUrl)
      .filter(Boolean),
    ...(id ? { id } : {}),
    sellerId: product.sellerUid || product.sellerId,
    sellerUid: product.sellerUid || product.sellerId,
    _id: undefined,
  };
}

function publicProductResponse(product) {
  return {
    id: product._id.toString(),
    name: product.name || '',
    description: product.description || '',
    shortDescription: product.shortDescription || '',
    category: product.category || '',
    subCategory: product.subCategory || '',
    brand: product.brand || 'Fitness Species',
    sku: product.sku || '',
    price: product.price ?? 0,
    compareAtPrice: product.compareAtPrice ?? null,
    discountPercent: product.discountPercent ?? 0,
    images: (Array.isArray(product.images) ? product.images : [])
      .map(productImageUrl)
      .filter(Boolean),
    stock: product.stock ?? 0,
    lowStockThreshold: product.lowStockThreshold ?? 10,
    variants: (product.variants || []).map((variant) => ({
      ...(variant.id !== undefined ? { id: variant.id } : {}),
      ...(variant.title !== undefined ? { title: variant.title } : {}),
      ...(variant.name !== undefined ? { name: variant.name } : {}),
      ...(variant.value !== undefined ? { value: variant.value } : {}),
      ...(variant.sku !== undefined ? { sku: variant.sku } : {}),
      ...(variant.price !== undefined ? { price: variant.price } : {}),
      ...(variant.stock !== undefined ? { stock: variant.stock } : {}),
      ...(variant.attributes !== undefined ? { attributes: variant.attributes } : {}),
    })),
    specifications: product.specifications || {},
    status: 'approved',
    createdAt: product.createdAt ?? null,
    updatedAt: product.updatedAt ?? null,
  };
}

function sellerResponse(seller) {
  if (!seller) return null;
  const required = [
    seller.businessName,
    seller.ownerName,
    seller.email,
    seller.phone,
    seller.businessAddress?.address,
    seller.businessAddress?.city,
    seller.businessAddress?.state,
    seller.businessAddress?.country,
    seller.businessAddress?.postalCode,
  ];
  const filled = required.filter((value) => (
    typeof value === 'string' && value.trim().length > 0
  )).length;
  return {
    id: seller._id?.toString(),
    firebaseUid: seller.firebaseUid,
    businessName: seller.businessName || '',
    ownerName: seller.ownerName || '',
    email: seller.email || '',
    phone: seller.phone || '',
    businessAddress: seller.businessAddress || {},
    profileComplete: filled === required.length,
    profileCompletion: Math.round((filled / required.length) * 100),
    status: seller.status || 'pending',
    rejectionReason: seller.rejectionReason || null,
    createdAt: seller.createdAt,
    updatedAt: seller.updatedAt,
    approvedAt: seller.approvedAt || null,
  };
}

async function findSellerRecord(db, uid) {
  const sellers = db.collection('sellers');
  const seller = await sellers.findOne({ firebaseUid: uid });
  if (seller) return { seller, collection: sellers };

  const profiles = db.collection('sellerProfiles');
  const legacyProfile = await profiles.findOne({ firebaseUid: uid });
  return legacyProfile ? { seller: legacyProfile, collection: profiles } : null;
}

async function findSeller(db, uid) {
  return (await findSellerRecord(db, uid))?.seller || null;
}

function ensureCompleteSeller(seller, res) {
  const response = sellerResponse(seller);
  if (!response || !response.profileComplete) {
    res.status(409).json({
      success: false,
      message: 'Complete the required seller profile fields before submitting products.',
      requiredFields: [
        'businessName',
        'ownerName',
        'verified account email',
        'phone',
        'businessAddress.address',
        'businessAddress.city',
        'businessAddress.state',
        'businessAddress.country',
        'businessAddress.postalCode',
      ],
    });
    return false;
  }
  return true;
}

function validatePricePair(product) {
  if (
    product.compareAtPrice !== undefined
    && product.compareAtPrice !== null
    && product.compareAtPrice <= product.price
  ) {
    return 'compareAtPrice must be greater than price.';
  }
  return null;
}

function makeProductDocument(input, uid, now = new Date()) {
  const compareAtPrice = input.compareAtPrice ?? null;
  const discountPercent = compareAtPrice
    ? Math.round(((compareAtPrice - input.price) / compareAtPrice) * 100)
    : 0;
  return {
    sellerId: uid,
    sellerUid: uid,
    name: input.name.trim(),
    description: input.description || '',
    shortDescription: input.shortDescription || '',
    category: input.category,
    subCategory: input.subCategory || '',
    brand: input.brand || 'Fitness Species',
    sku: input.sku || `SKU-${randomUUID()}`,
    price: input.price,
    compareAtPrice,
    discountPercent,
    images: input.images || [],
    stock: input.stock,
    lowStockThreshold: input.lowStockThreshold ?? 10,
    variants: input.variants || [],
    specifications: input.specifications || {},
    status: 'pending',
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    approvedAt: null,
    rejectedAt: null,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createMarketplaceControllers({ getDb }) {
  const getSellerProfile = asyncRoute(async (req, res) => {
    const seller = await findSeller(getDb(), req.user.uid);
    if (!seller) {
      res.status(404).json({
        success: false,
        code: 'SELLER_PROFILE_SETUP_REQUIRED',
        setupRequired: true,
        message: 'Seller profile not found. Please save your seller profile first.',
      });
      return;
    }
    const profile = sellerResponse(seller);
    res.json({
      success: true,
      setupRequired: !profile.profileComplete,
      ...(profile.profileComplete
        ? {}
        : { message: 'Complete your seller profile setup before submitting products.' }),
      seller: profile,
    });
  });

  const saveSellerProfile = asyncRoute(async (req, res) => {
    const validator = req.method === 'POST'
      ? createSellerProfileSchema
      : updateSellerProfileSchema;
    const result = validator.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const db = getDb();
    const uid = req.user.uid;
    const sellerProfiles = db.collection('sellerProfiles');
    const existingRecord = await findSellerRecord(db, uid);
    const existing = existingRecord?.seller;
    const businessAddress = {
      ...(existing?.businessAddress || {}),
      ...(result.data.businessAddress || {}),
    };
    const setFields = {
      businessAddress,
      updatedAt: new Date(),
    };
    for (const field of ['businessName', 'ownerName', 'phone']) {
      if (result.data[field] !== undefined) setFields[field] = result.data[field];
      else if (existing?.[field] !== undefined) setFields[field] = existing[field];
    }
    if (req.user.email) setFields.email = req.user.email;
    else if (existing?.email !== undefined) setFields.email = existing.email;
    const profileState = sellerResponse({
      ...existing,
      firebaseUid: uid,
      ...setFields,
    });
    setFields.profileComplete = profileState.profileComplete;
    setFields.profileCompletion = profileState.profileCompletion;

    const saved = await (existingRecord?.collection || sellerProfiles).findOneAndUpdate(
      { firebaseUid: uid },
      {
        $setOnInsert: {
          firebaseUid: uid,
          status: 'pending',
          createdAt: new Date(),
        },
        $set: setFields,
      },
      { upsert: !existingRecord, returnDocument: 'after' },
    );
    res.status(200).json({
      success: true,
      seller: sellerResponse(saved),
    });
  });

  const createProduct = asyncRoute(async (req, res) => {
    const result = createProductSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    if (!isValidNewSellerImageList(result.data.images, req.user.uid)) {
      res.status(400).json({
        success: false,
        message: 'Upload product images to the seller-owned Firebase Storage folder before submitting.',
      });
      return;
    }
    const priceError = validatePricePair(result.data);
    if (priceError) {
      res.status(400).json({ success: false, message: priceError });
      return;
    }

    const db = getDb();
    if (!ensureCompleteSeller(await findSeller(db, req.user.uid), res)) return;
    const product = makeProductDocument(result.data, req.user.uid);
    const insert = await db.collection('products').insertOne(product);
    product._id = insert.insertedId;
    res.status(201).json({
      success: true,
      product: productResponse(product),
    });
  });

  const listSellerProducts = asyncRoute(async (req, res) => {
    const result = sellerProductQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);
    const query = sellerProductFilter(req.user.uid);
    if (result.data.status) query.status = result.data.status;
    const products = await getDb().collection('products')
      .find(query).sort({ createdAt: -1 }).toArray();
    res.json({
      success: true,
      count: products.length,
      products: products.map(productResponse),
    });
  });

  const getSellerProduct = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.productId)) {
      res.status(400).json({ success: false, message: 'Invalid product ID.' });
      return;
    }
    const product = await getDb().collection('products').findOne({
      _id: new ObjectId(req.params.productId),
      ...sellerProductFilter(req.user.uid),
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found.' });
      return;
    }
    res.json({ success: true, product: productResponse(product) });
  });

  const updateProduct = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.productId)) {
      res.status(400).json({ success: false, message: 'Invalid product ID.' });
      return;
    }
    const result = updateProductSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const db = getDb();
    const products = db.collection('products');
    const filter = {
      _id: new ObjectId(req.params.productId),
      ...sellerProductFilter(req.user.uid),
    };
    const existing = await products.findOne(filter);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Product not found.' });
      return;
    }
    if (!ensureCompleteSeller(await findSeller(db, req.user.uid), res)) return;
    if (
      result.data.images !== undefined
      && !isValidNewSellerImageList(result.data.images, req.user.uid, existing.images, true)
    ) {
      res.status(400).json({
        success: false,
        message: 'New product images must be uploaded to the seller-owned Firebase Storage folder.',
      });
      return;
    }

    const merged = { ...existing, ...result.data };
    const priceError = validatePricePair(merged);
    if (priceError) {
      res.status(400).json({ success: false, message: priceError });
      return;
    }
    const updated = await products.findOneAndUpdate(
      filter,
      {
        $set: {
          ...result.data,
          discountPercent: merged.compareAtPrice
            ? Math.round(((merged.compareAtPrice - merged.price) / merged.compareAtPrice) * 100)
            : 0,
          status: 'pending',
          rejectionReason: null,
          approvedAt: null,
          rejectedAt: null,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    res.json({ success: true, product: productResponse(updated) });
  });

  const updateProductStock = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.productId)) {
      res.status(400).json({ success: false, message: 'Invalid product ID.' });
      return;
    }
    const result = updateProductStockSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const filter = {
      _id: new ObjectId(req.params.productId),
      ...sellerProductFilter(req.user.uid),
    };
    const updated = await getDb().collection('products').findOneAndUpdate(
      filter,
      {
        $set: {
          stock: result.data.stock,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      res.status(404).json({ success: false, message: 'Product not found.' });
      return;
    }
    res.json({ success: true, product: productResponse(updated) });
  });

  const listAdminProducts = asyncRoute(async (req, res) => {
    const result = adminProductQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);
    const { status, page, limit } = result.data;
    const filter = status === 'all' ? {} : { status };
    const collection = getDb().collection('products');
    const [products, total] = await Promise.all([
      collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    res.json({
      success: true,
      count: products.length,
      total,
      page,
      limit,
      products: products.map(productResponse),
    });
  });

  const getAdminProduct = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.productId)) {
      res.status(400).json({ success: false, message: 'Invalid product ID.' });
      return;
    }
    const db = getDb();
    const product = await db.collection('products').findOne({
      _id: new ObjectId(req.params.productId),
    });
    if (!product) {
      res.status(404).json({ success: false, message: 'Product not found.' });
      return;
    }
    const seller = await findSeller(db, product.sellerUid || product.sellerId);
    res.json({
      success: true,
      product: {
        ...productResponse(product),
        seller: seller ? {
          businessName: seller.businessName || '',
          ownerName: seller.ownerName || '',
          email: seller.email || '',
          phone: seller.phone || '',
        } : null,
      },
    });
  });

  const reviewProduct = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.productId)) {
      res.status(400).json({ success: false, message: 'Invalid product ID.' });
      return;
    }
    const result = productReviewSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);
    const { status, rejectionReason } = result.data;
    const now = new Date();
    const update = status === 'approved'
      ? {
        status,
        approvedAt: now,
        rejectedAt: null,
        rejectionReason: null,
        updatedAt: now,
      }
      : {
        status,
        approvedAt: null,
        rejectedAt: now,
        rejectionReason,
        updatedAt: now,
      };
    const product = await getDb().collection('products').findOneAndUpdate(
      { _id: new ObjectId(req.params.productId), status: 'pending' },
      { $set: update },
      { returnDocument: 'after' },
    );
    if (!product) {
      const exists = await getDb().collection('products').findOne({
        _id: new ObjectId(req.params.productId),
      });
      res.status(exists ? 409 : 404).json({
        success: false,
        message: exists
          ? 'Only pending products can be reviewed.'
          : 'Product not found.',
      });
      return;
    }
    res.json({ success: true, product: productResponse(product) });
  });

  const listPublicProducts = asyncRoute(async (req, res) => {
    const result = publicProductQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);
    const {
      category, subCategory, brand, search, minPrice, maxPrice, page, limit,
    } = result.data;
    const filter = { status: 'approved' };
    if (category) filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    if (brand) filter.brand = brand;
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = minPrice;
      if (maxPrice !== undefined) filter.price.$lte = maxPrice;
    }
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: regex },
        { description: regex },
        { brand: regex },
      ];
    }
    const collection = getDb().collection('products');
    const [products, total] = await Promise.all([
      collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    res.json({
      success: true,
      count: products.length,
      total,
      page,
      limit,
      products: products.map(publicProductResponse),
    });
  });

  const getPublicProduct = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.productId)) {
      res.status(400).json({ success: false, message: 'Invalid product ID.' });
      return;
    }
    const product = await getDb().collection('products').findOne({
      _id: new ObjectId(req.params.productId),
      status: 'approved',
    });
    if (!product) {
      res.status(404).json({
        success: false,
        message: 'Product not found or not available.',
      });
      return;
    }
    res.json({ success: true, product: publicProductResponse(product) });
  });

  return {
    getSellerProfile,
    saveSellerProfile,
    createProduct,
    listSellerProducts,
    getSellerProduct,
    updateProduct,
    updateProductStock,
    listAdminProducts,
    getAdminProduct,
    reviewProduct,
    listPublicProducts,
    getPublicProduct,
  };
}
