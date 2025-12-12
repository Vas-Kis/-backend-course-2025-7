import * as fs from 'fs/promises';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';

const HOST  = process.env.HOST  || '0.0.0.0';
const PORT  = process.env.PORT  || 3000;
const CACHE = process.env.CACHE || './cache';

const app = express();
app.use(express.json());
const cache_path = path.resolve(CACHE);
const database_path = path.join(cache_path, 'db.json')
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Inventory Service API', version: '1.0.0', description: 'Inventory Service API', },
    servers: [{ url: `http://localhost:${PORT}` }]
  }, apis: ['./main.js'],};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const storage = multer.diskStorage({
  destination: cache_path,
  filename: (_req, file, cb) => {
    const fileExt = path.extname(file.originalname);
    const newName = Date.now() + fileExt; 
    cb(null, newName);
  }
});
const upload = multer({ storage: storage });

/**
 * @swagger
 * /RegisterForm.html:
 *   get:
 *     summary: Повертає HTML-форму для реєстрації інвентаря
 *     tags: [Forms]
 *     responses:
 *       200:
 *         description: HTML-сторінка з формою
 */

app.get('/RegisterForm.html', (_req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'RegisterForm.html')); });

/**
 * @swagger
 * /SearchForm.html:
 *   get:
 *     summary: Повертає HTML-форму для пошуку елементів інвентаря
 *     tags: [Forms]
 *     responses:
 *       200:
 *         description: HTML-сторінка з формою пошуку
 */

app.get('/SearchForm.html', (_req, res) => {
  res.status(200).sendFile(path.join(__dirname, 'SearchForm.html')); });
  
/**
 * @swagger
 * /register:
 *   post:
 *     summary: Реєструє новий предмет інвентаря
 *     tags: [Inventory]
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               inventory_name:
 *                 type: string
 *                 description: Назва інвентаря
 *               description:
 *                 type: string
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Створений елемент інвентаря
 *       400:
 *         description: Некоректні вхідні дані
 */

app.post('/register', upload.single('photo'), async (req, res) => {
  try {
    const { inventory_name, description } = req.body;
    if (!inventory_name) {
      return res.status(400).send('Error: "inventory_name" is required.');
    }
    let inventory = [];
    try {
      const dbData = await fs.readFile(database_path, 'utf8');
      inventory = JSON.parse(dbData);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err; 
    }
    
    const maxId = inventory.reduce((max, item) => Math.max(max, item.id), 0);
    const newId = maxId + 1;
    const photoName = req.file ? req.file.filename : null;

    const newItem = {
      id: newId, 
      name: inventory_name,
      description: description || '',
      photo: photoName };

    inventory.push(newItem);
    await fs.writeFile(database_path, JSON.stringify(inventory, null, 2));
    console.log(`Registered item ${newId} with photo ${photoName}`);
    res.status(201).json(newItem);

  } catch (err) {
    console.error('Error processing /register request:', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   get:
 *     summary: Повертає фото предмету інвентаря
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Фото предмету
 *       404:
 *         description: Не знайдено елемент або його фото
 */

app.get('/inventory/:id/photo', async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID.'); }
    let dbData;
    try {
      dbData = await fs.readFile(database_path, 'utf8');
    } catch (dbErr) {
      if (dbErr.code === 'ENOENT') {
        return res.status(404).send('Inventory database not found.'); }
      throw dbErr; }

    const inventory = JSON.parse(dbData);
    const item = inventory.find(i => i.id === requestedId);
    if (!item) {
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }
    if (!item.photo) {
      return res.status(404).send('Item has no photo.');
    }
    const photoPath = path.join(cache_path, item.photo);
    
    res.sendFile(photoPath, (err) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.status(404).send('Photo file not found on disk.');
        } else {
          console.error('Error sending file:', err);
          res.status(500).send('Server error sending file.');
        }
      }
    });
  } catch (err) {
    console.error('Error processing /inventory/:id/photo', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /inventory:
 *   get:
 *     summary: Отримує всі елементи інвентаря
 *     tags: [Inventory]
 *     responses:
 *       200:
 *         description: Список предметів інвентаря
 *       404:
 *         description: База не знайдена
 */

app.get('/inventory', async (_req, res) => {
  try {
    const dbData = await fs.readFile(database_path, 'utf8');
    const inventory = JSON.parse(dbData);
    const inventoryWithUrls = inventory.map(item => {
      const { photo, ...rest } = item;
      if (photo) {
        return {
          ...rest,
          photo_url: `/inventory/${item.id}/photo`
        };
      }
      return rest;
    });
    res.json(inventoryWithUrls);

  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).send('Inventory database not found.');
    } else {
      console.error('Error reading db.json:', err);
      res.status(500).send('Server Error');
    }
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   get:
 *     summary: Отримує предмет інвентаря за ID
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
     responses:
 *       200:
 *         description: Дані елемента інвентаря
 *       404:
 *         description: Не знайдено
 */

app.get('/inventory/:id', async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID. Must be a number.');
    }
    let dbData;
    try {
      dbData = await fs.readFile(database_path, 'utf8');
    } catch (dbErr) {
      if (dbErr.code === 'ENOENT') {
        return res.status(404).send('Inventory database not found.');
      }
      throw dbErr;
    }
    const inventory = JSON.parse(dbData);
    const item = inventory.find(i => i.id === requestedId);
    if (!item) {
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }
    const { photo, ...rest } = item;
    let itemResponse;
    if (photo) {
      itemResponse = {
        ...rest,
        photo_url: `/inventory/${item.id}/photo`
      };
    } else {
      itemResponse = rest;
    }
    res.json(itemResponse);
  } catch (err) {
    console.error('Error processing /inventory/:id', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   put:
 *     summary: Оновлює дані предмета інвентаря
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Оновлений елемент
 *       404:
 *         description: Не знайдено
 */

app.put('/inventory/:id', async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);
    const { name, description } = req.body;
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID.');
    }
    let inventory;
    try {
      const dbData = await fs.readFile(database_path, 'utf8');
      inventory = JSON.parse(dbData);
    } catch (dbErr) {
      if (dbErr.code === 'ENOENT') {
        return res.status(404).send('Inventory database not found.');
      }
      throw dbErr;
    }
    const itemIndex = inventory.findIndex(i => i.id === requestedId);
    if (itemIndex === -1) {
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }
    const item = inventory[itemIndex];
    if (name !== undefined) {
      item.name = name;
    }
    if (description !== undefined) {
      item.description = description;
    }

    await fs.writeFile(database_path, JSON.stringify(inventory, null, 2));
    const { photo, ...rest } = item;
    const responseItem = { ...rest };
    if (photo) {
      responseItem.photo_url = `/inventory/${item.id}/photo`;
    }
    res.json(responseItem);

  } catch (err) {
    console.error('Error processing PUT /inventory/:id', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /inventory/{id}/photo:
 *   put:
 *     summary: Оновлює фото предмета інвентаря
 *     tags: [Inventory]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Фото оновлено
 *       404:
 *         description: Елемент не знайдено
 */

app.put('/inventory/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID.');
    }
    if (!req.file) {
      return res.status(400).send('No photo file uploaded.');
    }
    let inventory;
    try {
      const dbData = await fs.readFile(database_path, 'utf8');
      inventory = JSON.parse(dbData);
    } catch (dbErr) {
      if (dbErr.code === 'ENOENT') {
        return res.status(404).send('Inventory database not found.');
      }
      throw dbErr;
    }
    const itemIndex = inventory.findIndex(i => i.id === requestedId);
    if (itemIndex === -1) {
      await fs.unlink(req.file.path); 
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }
    const oldPhotoName = inventory[itemIndex].photo;
    if (oldPhotoName) {
      try {
        await fs.unlink(path.join(cache_path, oldPhotoName));
      } catch (unlinkErr) {
        console.warn(`Could not delete old photo: ${oldPhotoName}`, unlinkErr.message);
      }
    }
    inventory[itemIndex].photo = req.file.filename;
    await fs.writeFile(database_path, JSON.stringify(inventory, null, 2));
    res.status(200).send('Photo updated successfully.');

  } catch (err) {
    console.error('Error processing PUT /inventory/:id/photo', err);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /inventory/{id}:
 *   delete:
 *     summary: Видаляє предмет інвентаря
 *     tags: [Inventory]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *     responses:
 *       200:
 *         description: Видалено успішно
 *       404:
 *         description: Елемент не знайдено
 */

app.delete('/inventory/:id', async (req, res) => {
  try {
    const requestedId = parseInt(req.params.id, 10);
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID.');
    }
    
    let inventory;
    try {
      const dbData = await fs.readFile(database_path, 'utf8');
      inventory = JSON.parse(dbData);
    } catch (dbErr) {
      if (dbErr.code === 'ENOENT') {
        return res.status(404).send('Inventory database not found.');
      }
      throw dbErr;
    }
    const itemIndex = inventory.findIndex(i => i.id === requestedId);
    if (itemIndex === -1) {
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }
    const itemToDelete = inventory[itemIndex];
    inventory.splice(itemIndex, 1);

    await fs.writeFile(database_path, JSON.stringify(inventory, null, 2));
    if (itemToDelete.photo) {
      try {
        await fs.unlink(path.join(cache_path, itemToDelete.photo));
      } catch (unlinkErr) {
        console.warn(`Could not delete photo: ${itemToDelete.photo}`, unlinkErr.message);
      }
    }
    res.status(200).send('Item deleted successfully.');

  } catch (err) {
    console.error('Error processing DELETE /inventory/:id', err);
    res.status(500).send('Internal Server Error');
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
    const requestedId = parseInt(id, 10);
    if (isNaN(requestedId)) {
      return res.status(400).send('Invalid ID. Must be a number.');
    }
    let inventory;
    try {
      const dbData = await fs.readFile(database_path, 'utf8');
      inventory = JSON.parse(dbData);
    } catch (dbErr) {
      if (dbErr.code === 'ENOENT') {
        return res.status(404).send('Inventory database not found.');
      }
      throw dbErr;
    }
    const item = inventory.find(i => i.id === requestedId);
    if (!item) {
      return res.status(404).send(`Item with ID ${requestedId} not found.`);
    }
    const { photo, ...rest } = item;
    const itemResponse = { ...rest }; 
    const shouldIncludePhoto = (has_photo === 'on');
    
    if (shouldIncludePhoto && photo) {
      itemResponse.photo_url = `/inventory/${item.id}/photo`;
    }
    res.json(itemResponse);

  } catch (err) {
    console.error('Error processing /search', err);
    res.status(500).send('Internal Server Error');
  }
});

app.all('/inventory/:id/photo', (_req, res) => {
  res.status(405).send('Method Not Allowed');
});

app.all('/inventory/:id', (_req, res) => {
  res.status(405).send('Method Not Allowed');
});

app.all('/inventory', (_req, res) => {
  res.status(405).send('Method Not Allowed');
});

(async () => {
  try {
    await fs.mkdir(cache_path, { recursive: true });
    console.log('Cache folder directory', cache_path);
    app.listen(PORT, HOST, () => {
      console.log(`Server started on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error('Error :', err.message);
    process.exit(1);
  }
})();
