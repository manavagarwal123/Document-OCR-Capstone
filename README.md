# Document OCR Search System

A full-stack web application for uploading documents (PDFs and images), extracting text using OCR (Optical Character Recognition), and searching across multiple pages. Built with React frontend and Node.js/Express backend with MongoDB.

## 🚀 Features

- **Document Upload**: Upload PDFs and images (PNG, JPEG)
- **Multi-page OCR**: Extract text from all pages of PDF documents
- **Advanced Search**: Search across all uploaded documents with highlighted results
- **User Authentication**: Secure login and registration system with JWT tokens
- **Real-time Processing**: Server-Sent Events (SSE) for live OCR progress updates
- **Multi-language Support**: Support for English, Spanish, and German OCR
- **Document Management**: View extracted text, confidence scores, and page thumbnails
- **Statistics Dashboard**: Real-time stats showing documents, pages, and search counts
- **Modern UI**: Beautiful, responsive interface with glassmorphism design

## 📋 Prerequisites

Before running this project, make sure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **MongoDB** (v4.4 or higher) - Make sure MongoDB is running on your system

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/manavagarwal123/Document-OCR-Captstone.git
cd Document-OCR-Captstone
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

### 4. MongoDB Setup

Make sure MongoDB is installed and running:

**macOS (using Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux:**
```bash
sudo systemctl start mongod
```

**Windows:**
Start MongoDB service from Services panel or run:
```bash
mongod
```

The application will connect to MongoDB at `mongodb://127.0.0.1:27017/doc-ocr` by default.

## ⚙️ Configuration

### Environment Variables (Optional)

Create a `.env` file in the `backend` directory to customize settings:

```env
PORT=5001
MONGO=mongodb://127.0.0.1:27017/doc-ocr
JWT_SECRET=your-secret-key-here
```

If not provided, the application uses default values:
- Port: `5001`
- MongoDB: `mongodb://127.0.0.1:27017/doc-ocr`
- JWT Secret: `dev-secret`

## 🏃 Running the Application

### Start Backend Server

Open a terminal and run:

```bash
cd backend
npm start
```

You should see:
```
✅ OCR backend running on port 5001
📍 Health check: http://localhost:5001/api/health
📍 API root: http://localhost:5001/
```

### Start Frontend Server

Open another terminal and run:

```bash
cd frontend
npm start
```

The frontend will start on `http://localhost:3000` and automatically open in your browser.

### Access the Application

1. Open your browser and navigate to `http://localhost:3000`
2. You'll see the login page
3. Register a new account or login if you already have one
4. Start uploading documents and searching!

## 📁 Project Structure

```
new1/
├── backend/                 # Backend server (Node.js/Express)
│   ├── index.js            # Main server file with API routes
│   ├── models.js           # MongoDB schemas (Document, User, Stats)
│   ├── ocrWorker.js        # Background OCR processing worker
│   ├── utils.js            # Utility functions (file hashing)
│   ├── server.js           # Alternative server implementation (not used)
│   ├── package.json        # Backend dependencies
│   ├── uploads/            # Uploaded files storage
│   │   └── tmp/            # Temporary files during processing
│   ├── eng.traineddata     # English OCR language data
│   └── spa.traineddata     # Spanish OCR language data
│
├── frontend/               # Frontend application (React)
│   ├── src/
│   │   ├── App.js          # Main app component with routing
│   │   ├── index.js        # React entry point
│   │   ├── Login.js        # Login/Register component
│   │   ├── Upload.js       # Document upload component
│   │   ├── Search.js       # Search interface component
│   │   └── styles.css      # Global styles
│   ├── public/
│   │   └── index.html      # HTML template
│   └── package.json        # Frontend dependencies
│
└── README.md               # This file
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login existing user

### Documents
- `POST /api/upload` - Upload a document (PDF/image)
- `GET /api/doc/:id` - Get document details by ID
- `POST /api/reprocess/:docId` - Reprocess a document

### Search
- `GET /api/search?q=<query>` - Search documents by text

### Statistics
- `GET /api/stats` - Get application statistics
- `POST /api/stats/increment-search` - Increment search count

### Events
- `GET /api/events/:docId` - Server-Sent Events stream for OCR progress

### Health
- `GET /api/health` - Health check endpoint

## 🎨 Technology Stack

### Backend
- **Express.js** - Web framework
- **MongoDB** (via Mongoose) - Database
- **Tesseract.js** - OCR engine
- **Multer** - File upload handling
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **Sharp** - Image processing
- **pdf-poppler** - PDF to image conversion

### Frontend
- **React** - UI framework
- **Axios** - HTTP client
- **Framer Motion** - Animations (optional)

## 🔒 Security Features

- Password hashing with bcrypt
- JWT-based authentication
- CORS protection
- File type validation
- Request rate limiting ready

## 📝 Usage Guide

### Uploading Documents

1. Click on the upload area or drag and drop a file
2. Select language (English, Spanish, or German)
3. Click "Upload & OCR"
4. Watch the progress bar as the document is processed
5. View extracted text and page thumbnails

### Searching Documents

1. Enter keywords in the search box
2. Click "Search" or press Enter
3. Results show matching documents with:
   - Page numbers where matches were found
   - Highlighted text snippets
   - Confidence scores
   - Document thumbnails

### Viewing Statistics

The dashboard shows real-time statistics:
- Total documents uploaded
- Total pages processed
- Total searches performed

## 🐛 Troubleshooting

### Backend won't start
- Check if MongoDB is running: `mongod --version`
- Check if port 5001 is available: `lsof -ti:5001`
- Verify dependencies are installed: `cd backend && npm install`

### Frontend shows "Backend server not running"
- Ensure backend is running on port 5001
- Check browser console for CORS errors
- Verify backend health endpoint: `curl http://localhost:5001/api/health`

### OCR not working
- Ensure Tesseract.js dependencies are installed
- Check browser console for errors
- Verify uploaded file format is supported (PDF, PNG, JPEG)

### MongoDB connection errors
- Ensure MongoDB service is running
- Check connection string in `.env` or `index.js`
- Verify MongoDB is accessible: `mongosh` or `mongo`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.

## 👨‍💻 Author

Manav Agarwal

## 🎯 Future Enhancements

- [ ] User document management (delete, organize)
- [ ] Export extracted text to various formats
- [ ] Batch upload support
- [ ] Advanced search filters
- [ ] Document sharing capabilities
- [ ] OCR accuracy improvements
- [ ] Additional language support
- [ ] Dark/Light theme toggle

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

**Note**: Make sure both backend and frontend servers are running simultaneously for the application to work properly.
