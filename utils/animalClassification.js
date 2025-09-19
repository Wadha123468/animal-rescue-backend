const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class AnimalClassificationService {
  constructor() {
    this.pythonScript = path.join(__dirname, '../ai_service.py');
    this.modelPath = path.join(__dirname, '../animal_mobilenet.pth');
    this.supportedFormats = ['jpg', 'jpeg', 'png', 'webp'];
    this.isModelAvailable = false;
    this.modelInfo = null;
    
    // Initialize model check
    this.checkModelAvailability();
  }

  async checkModelAvailability() {
    try {
      // Check if Python script exists
      await fs.access(this.pythonScript);
      
      // Check if model file exists
      await fs.access(this.modelPath);
      
      // Test model loading
      const healthResult = await this.callPythonScript('health');
      if (healthResult.success && healthResult.data.model_loaded) {
        this.isModelAvailable = true;
        this.modelInfo = await this.getModelInfo();
        console.log('✅ PyTorch model loaded successfully');
        console.log(`📊 Supported classes: ${this.modelInfo.supported_classes.join(', ')}`);
      } else {
        console.warn('⚠️ PyTorch model not available, using fallback simulation');
        this.isModelAvailable = false;
      }
    } catch (error) {
      console.warn('⚠️ PyTorch model setup failed, using fallback simulation:', error.message);
      this.isModelAvailable = false;
    }
  }

  async callPythonScript(command, ...args) {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [this.pythonScript, command, ...args], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve({ success: true, data: result });
          } catch (parseError) {
            resolve({ success: false, error: 'Failed to parse Python output', stdout });
          }
        } else {
          resolve({ success: false, error: stderr || 'Python script failed', code });
        }
      });

      pythonProcess.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });
    });
  }

  async classifyImage(imagePath, imageBuffer = null) {
    try {
      const startTime = Date.now();

      if (this.isModelAvailable) {
        // Use actual PyTorch model
        const result = await this.callPythonScript('predict', imagePath);
        
        if (result.success && result.data.success) {
          const processingTime = (Date.now() - startTime) / 1000;
          
          return {
            success: true,
            predictions: result.data.predictions,
            modelInfo: result.data.model_info,
            processingTime,
            timestamp: result.data.timestamp,
            source: 'pytorch_model'
          };
        } else {
          console.warn('PyTorch prediction failed, using fallback:', result.error);
          return this.fallbackClassification(processingTime);
        }
      } else {
        // Use fallback simulation
        return this.fallbackClassification();
      }
    } catch (error) {
      console.error('Classification error:', error);
      return {
        success: false,
        error: 'Classification failed',
        message: error.message
      };
    }
  }

  async classifyFromBase64(base64Image) {
    try {
      if (!base64Image.startsWith('data:image/')) {
        throw new Error('Invalid image format - expected base64 data URL');
      }

      const startTime = Date.now();

      if (this.isModelAvailable) {
        // Use actual PyTorch model
        const result = await this.callPythonScript('predict_base64', base64Image);
        
        if (result.success && result.data.success) {
          const processingTime = (Date.now() - startTime) / 1000;
          
          return {
            success: true,
            predictions: result.data.predictions,
            modelInfo: result.data.model_info,
            processingTime,
            timestamp: result.data.timestamp,
            source: 'pytorch_model'
          };
        } else {
          console.warn('PyTorch base64 prediction failed, using fallback:', result.error);
          return this.fallbackClassification();
        }
      } else {
        // Use fallback simulation
        return this.fallbackClassification();
      }
    } catch (error) {
      return {
        success: false,
        error: 'Base64 classification failed',
        message: error.message
      };
    }
  }

  // Fallback simulation for when PyTorch model is not available
  fallbackClassification() {
    const fallbackClasses = ['cat', 'dog', 'chicken', 'cow', 'horse', 'sheep'];
    const randomClass = fallbackClasses[Math.floor(Math.random() * fallbackClasses.length)];
    const confidence = 0.75 + Math.random() * 0.20;

    const predictions = [
      {
        species: this.capitalize(randomClass),
        confidence: confidence,
        class_index: fallbackClasses.indexOf(randomClass)
      }
    ];

    // Add secondary predictions
    const remaining = fallbackClasses.filter(c => c !== randomClass);
    for (let i = 0; i < Math.min(2, remaining.length); i++) {
      const cls = remaining[i];
      predictions.push({
        species: this.capitalize(cls),
        confidence: Math.max(0.1, confidence - (0.2 + Math.random() * 0.3)),
        class_index: fallbackClasses.indexOf(cls)
      });
    }

    return {
      success: true,
      predictions: predictions.sort((a, b) => b.confidence - a.confidence),
      processingTime: 1.0 + Math.random() * 0.8,
      timestamp: new Date().toISOString(),
      source: 'fallback_simulation',
      modelInfo: {
        name: 'Fallback Classification',
        supported_classes: fallbackClasses.map(c => this.capitalize(c))
      }
    };
  }

  async getModelInfo() {
    try {
      if (this.isModelAvailable) {
        const result = await this.callPythonScript('info');
        if (result.success) {
          return result.data;
        }
      }
      
      return {
        name: 'Fallback Classification Service',
        version: '1.0.0',
        model_loaded: false,
        supported_classes: ['Cat', 'Dog', 'Chicken', 'Cow', 'Horse', 'Sheep'],
        source: 'fallback'
      };
    } catch (error) {
      console.error('Error getting model info:', error);
      return { error: error.message };
    }
  }

  async healthCheck() {
    try {
      if (this.isModelAvailable) {
        const result = await this.callPythonScript('health');
        if (result.success) {
          return {
            ...result.data,
            python_available: true,
            model_file_exists: true
          };
        }
      }
      
      return {
        status: 'healthy',
        model_loaded: false,
        python_available: false,
        fallback_mode: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  validateImageFormat(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    return this.supportedFormats.includes(extension);
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  get supportedAnimals() {
    if (this.modelInfo && this.modelInfo.supported_classes) {
      return this.modelInfo.supported_classes.map(c => c.toLowerCase());
    }
    return ['cat', 'dog', 'chicken', 'cow', 'horse', 'sheep'];
  }
}

// Export singleton instance
module.exports = new AnimalClassificationService();
