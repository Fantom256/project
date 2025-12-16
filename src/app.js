import express from 'express';
import cors from 'cors';

import indexRoutes from './routes/index.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

// ✅ статика (HTML/CSS/JS из папки public)
app.use(express.static('public'));

app.use('/api', indexRoutes);

export default app;
