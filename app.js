require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const uploadDirectory = path.join(__dirname, 'public', 'uploads');
const dataDirectory = path.join(__dirname, 'data');
const dataFile = path.join(dataDirectory, 'products.json');

fs.mkdirSync(uploadDirectory, { recursive: true });

async function readProducts() {
    try {
        const products = JSON.parse(await fs.promises.readFile(dataFile, 'utf8'));
        return Array.isArray(products) ? products : [];
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
}

async function writeProducts(products) {
    await fs.promises.mkdir(dataDirectory, { recursive: true });
    await fs.promises.writeFile(dataFile, JSON.stringify(products, null, 2) + '\n', 'utf8');
}

async function addProduct(product) {
    const products = await readProducts();
    const newProduct = { id: crypto.randomUUID(), ...product, createdAt: new Date().toISOString() };
    products.push(newProduct);
    await writeProducts(products);
}

async function deleteProduct(id) {
    const products = await readProducts();
    const index = products.findIndex(product => product.id === id);
    if (index === -1) return null;
    const [product] = products.splice(index, 1);
    await writeProducts(products);
    return product;
}

const upload = multer({
    storage: multer.diskStorage({
        destination: uploadDirectory,
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname).toLowerCase();
            callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) return callback(new Error('File type not allowed'));
        callback(null, true);
    }
});

app.set('view engine', 'ejs');
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'ubah-session-secret-ini',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 3600000,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
    }
}));

function renderAdmin(res, options = {}) {
    res.render('admin', { products: [], authenticated: false, error: null, ...options });
}

function requireAdmin(req, res, next) {
    if (req.session.isLoggedIn) return next();
    renderAdmin(res);
}

app.get('/', async (req, res) => {
    try {
        const products = (await readProducts()).sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
        res.render('index', { products });
    } catch (error) {
        console.error('Gagal memuat katalog:', error.message);
        res.status(500).send('Gagal memuat katalog.');
    }
});

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/admin', async (req, res) => {
    if (!req.session.isLoggedIn) return renderAdmin(res);

    try {
        const products = (await readProducts()).sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
        renderAdmin(res, { products, authenticated: true });
    } catch (error) {
        console.error('Gagal memuat dashboard:', error.message);
        renderAdmin(res, { authenticated: true, error: 'Gagal memuat data produk.' });
    }
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return renderAdmin(res, { error: 'Username atau password salah.' });
    }

    req.session.regenerate(error => {
        if (error) return res.status(500).send('Gagal membuat sesi login.');
        req.session.isLoggedIn = true;
        res.redirect('/admin');
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin'));
});

app.post('/admin/add', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, description, price } = req.body;
        const parsedPrice = Number(price);
        if (!name?.trim() || !description?.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return renderAdmin(res, { authenticated: true, error: 'Nama, deskripsi, dan harga harus diisi dengan benar.' });
        }

        await addProduct({
            name: name.trim(),
            description: description.trim(),
            price: parsedPrice,
            image: req.file ? `/uploads/${req.file.filename}` : ''
        });
        res.redirect('/admin');
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error('Gagal menyimpan produk:', error.message);
        res.status(500).send('Gagal menyimpan produk.');
    }
});

app.post('/admin/delete/:id', requireAdmin, async (req, res) => {
    try {
        const product = await deleteProduct(req.params.id);
        if (!product) return res.status(404).send('Produk tidak ditemukan.');

        if (product.image?.startsWith('/uploads/')) {
            const imagePath = path.join(uploadDirectory, path.basename(product.image));
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        }
        res.redirect('/admin');
    } catch (error) {
        console.error('Gagal menghapus produk:', error.message);
        res.status(500).send('Gagal menghapus produk.');
    }
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError || error.message === 'File type not allowed') {
        return res.status(400).send('File harus berupa JPG, PNG, WEBP, atau GIF dengan ukuran maksimal 5 MB.');
    }
    console.error('Kesalahan server:', error.message);
    res.status(500).send('Terjadi kesalahan server.');
});

app.listen(PORT, HOST, () => console.log(`Server berjalan di http://${HOST}:${PORT}`));
