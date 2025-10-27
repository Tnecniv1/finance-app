const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const CsvController = require('../controllers/csvController');
const { requireAuth } = require('../middleware/auth');

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Dossier temporaire pour les uploads
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'csv-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les fichiers CSV et TXT
    const allowedTypes = ['.csv', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers CSV et TXT sont acceptés'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// Appliquer le middleware d'authentification à toutes les routes
router.use(requireAuth);

// Afficher la page d'import
router.get('/', CsvController.showImportPage);

// Télécharger le template CSV
router.get('/template', CsvController.downloadTemplate);

// Traiter l'upload du fichier CSV
router.post('/', upload.single('csvFile'), CsvController.handleCsvUpload);

module.exports = router;