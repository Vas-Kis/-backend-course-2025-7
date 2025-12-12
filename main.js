import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import pkg from 'pg';
const { Pool } = pkg;

const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;
const CACHE = process.env.CACHE || './cache';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const app = express();
app.use(express.json());

const cache_path = path.resolve(CACHE);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Service API',
      version: '1.0.0',
      description: 'Inventory Service API',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
  },
  apis: ['./main.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const storage = multer.diskStorage({
  destination: cache_path,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

app.get('/RegisterForm.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

app.get('/SearchForm.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєструє новий предмет інвентаря
 *     tags: [Inventory]
 */
app.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { inventory_name, description } = req.body;
    if (!inventory_name) {
      return res.status(400).send('inventory_name is required');
    }

    const photo = req.file ? req.file.filename : null;

    const result = await pool.query(
      `INSERT INTO inventory (name, description, photo)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, photo`,
      [inventory_name, description || '', photo]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримує всі елементи інвентаря
 *     tags: [Inventory]
 */
app.get('/inventory', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, photo FROM inventory'
    );

    const data = result.rows.map(item =>
      item.photo
        ? {
            id: item.id,
            name: item.name,
            description: item.description,
            photo_url: `/inventory/${item.id}/photo`,
          }
        : {
            id: item.id,
            name: item.name,
            description: item.description,
          }
    );

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримує предмет інвентаря за ID
 *     tags: [Inventory]
 */
app.get('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).send('Invalid ID');
  }

  try {
    const result = await pool.query(
      'SELECT id, name, description, photo FROM inventory WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Item not found');
    }

    const item = result.rows[0];
    if (item.photo) {
      item.photo_url = `/inventory/${item.id}/photo`;
      delete item.photo;
    }

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Повертає фото предмету інвентаря
 *     tags: [Inventory]
 */
app.get('/inventory/:id/photo', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).send('Invalid ID');
  }

  try {
    const result = await pool.query(
      'SELECT photo FROM inventory WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0 || !result.rows[0].photo) {
      return res.status(404).send('Photo not found');
    }

    res.sendFile(path.join(cache_path, result.rows[0].photo));
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновлює дані предмета інвентаря
 *     tags: [Inventory]
 */
app.put('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;
  if (isNaN(id)) {
    return res.status(400).send('Invalid ID');
  }

  try {
    const result = await pool.query(
      `UPDATE inventory
       SET name = COALESCE($1, name),
           description = COALESCE($2, description)
       WHERE id = $3
       RETURNING id, name, description, photo`,
      [name, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Item not found');
    }

    const item = result.rows[0];
    if (item.photo) {
      item.photo_url = `/inventory/${item.id}/photo`;
      delete item.photo;
    }

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлює фото предмета інвентаря
 *     tags: [Inventory]
 */
app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id) || !req.file) {
    return res.status(400).send('Invalid request');
  }

  try {
    const result = await pool.query(
      'UPDATE inventory SET photo = $1 WHERE id = $2 RETURNING id',
      [req.file.filename, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Item not found');
    }

    res.send('Photo updated');
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видаляє предмет інвентаря
 *     tags: [Inventory]
 */
app.delete('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).send('Invalid ID');
  }

  try {
    const result = await pool.query(
      'DELETE FROM inventory WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Item not found');
    }

    res.send('Item deleted');
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Пошук елемента інвентаря за ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *       - in: query
 *         name: has_photo
 *         schema:
 *           type: string
 *           enum: [on]
 *         description: Якщо 'on', повертається також URL фото
 *     responses:
 *       200:
 *         description: Результат пошуку
 *       404:
 *         description: Не знайдено
 */
app.get('/search', async (req, res) => {
  try {
    const { id, has_photo } = req.query;

    if (!id) {
      return res.status(400).send('Search ID is required.');
    }

    const requestedId = Number(id);
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID. Must be a number.');
    }

    const result = await pool.query(
      'SELECT id, name, description, photo FROM inventory WHERE id = $1',
      [requestedId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }

    const item = result.rows[0];
    const shouldIncludePhoto = has_photo === 'on';

    const response = {
      id: item.id,
      name: item.name,
      description: item.description,
    };

    if (shouldIncludePhoto && item.photo) {
      response.photo_url = `/inventory/${item.id}/photo`;
    }

    res.json(response);
  } catch (err) {
    console.error('Error processing /search', err);
    res.status(500).send('Internal Server Error');
  }
});

(async () => {
  try {
    app.listen(PORT, HOST, () => {
      console.log(`Server started on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();