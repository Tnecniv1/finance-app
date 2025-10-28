const express = require('express');
const router = express.Router();
const multer = require('multer');
const CsvController = require('../controllers/csvController');
const { requireAuth } = require('../middleware/auth');

// Configuration multer pour stocker en MÉMOIRE (pas de fichier physique)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.txt'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    
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

// Middleware d'authentification
router.use(requireAuth);

// Afficher la page d'import
router.get('/', CsvController.showImportPage);

// Télécharger le template CSV
router.get('/template', CsvController.downloadTemplate);

// Afficher l'historique des imports
router.get('/history', CsvController.showImportHistory);

// Traiter l'upload du fichier CSV
router.post('/', upload.single('csvFile'), CsvController.handleCsvUpload);

module.exports = router;