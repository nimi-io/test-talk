# Test Talk - Efficient Twilio Voice Service

A highly optimized NestJS service for handling Twilio Voice calls with browser-to-phone and phone-to-browser capabilities.

## 🚀 Features

- **Browser-to-Phone Calls**: Make calls from web browsers to phone numbers
- **Phone-to-Browser Calls**: Receive incoming calls in web browsers
- **Rate Limiting**: Built-in protection against abuse
- **Call Management**: Track active calls, statistics, and call history
- **Modern UI**: Beautiful browser phone interface
- **Health Monitoring**: Comprehensive health checks and logging
- **Type Safe**: Full TypeScript implementation with proper validation

## 🏗️ Architecture

### Key Optimizations

1. **Modular Design**: Separated concerns into focused modules
2. **Configuration Management**: Centralized Twilio configuration with validation
3. **TwiML Generation**: Optimized TwiML response generation
4. **Rate Limiting**: Efficient in-memory rate limiting with cleanup
5. **Error Handling**: Comprehensive error handling and logging
6. **Resource Management**: Proper cleanup and memory management

### Project Structure

```
src/
├── config/          # Configuration services
├── controllers/     # HTTP controllers
├── dto/            # Data Transfer Objects
├── modules/        # NestJS modules
├── services/       # Business logic services
├── twiml/          # TwiML generation utilities
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

## 🛠️ Setup

### Prerequisites

- Node.js 18+ 
- Twilio Account
- TwiML Application configured in Twilio Console

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and update with your Twilio credentials:
   ```bash
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_API_KEY=your_api_key
   TWILIO_API_SECRET=your_api_secret
   TWILIO_TWIML_APP_SID=your_twiml_app_sid
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

4. **Start the service:**
   ```bash
   npm start
   ```

   For development:
   ```bash
   npm run start:dev
   ```

## 📱 Usage

### Browser Phone Interface

Visit `http://localhost:3000/api/v1/test-talk/phone` to access the browser phone interface.

### API Endpoints

#### Authentication
- `GET /api/v1/test-talk/token` - Generate JWT token for browser client

#### Voice Calls
- `POST /api/v1/test-talk/call` - Make a browser-to-phone call
- `POST /api/v1/test-talk/voice` - TwiML webhook for outbound calls
- `POST /api/v1/test-talk/incoming` - Handle incoming phone calls

#### Call Management
- `GET /api/v1/test-talk/calls` - Get active calls and statistics
- `GET /api/v1/test-talk/calls/:callSid` - Get specific call details
- `POST /api/v1/test-talk/calls/:callSid/end` - End a specific call

#### Monitoring
- `GET /api/v1/test-talk/health` - Health check endpoint
- `GET /api/v1/test-talk/statistics` - Call statistics

### Making a Call

```javascript
// Browser client example
const response = await fetch('/api/v1/test-talk/call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: '+1234567890',
    from: 'browser'
  })
});

const result = await response.json();
console.log('Call initiated:', result.call.sid);
```

## 🔧 Configuration

### Twilio Setup

1. **Create a TwiML Application:**
   - Voice Request URL: `https://your-domain/api/v1/test-talk/voice`
   - Voice Fallback URL: `https://your-domain/api/v1/test-talk/voice`

2. **Configure Webhooks:**
   - Status Callback URL: `https://your-domain/api/v1/test-talk/call-status`

3. **Phone Number Configuration:**
   - Set webhook URL to: `https://your-domain/api/v1/test-talk/incoming`

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID | Yes |
| `TWILIO_API_KEY` | Your Twilio API Key | Yes |
| `TWILIO_API_SECRET` | Your Twilio API Secret | Yes |
| `TWILIO_TWIML_APP_SID` | Your TwiML Application SID | Yes |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number | Yes |
| `PORT` | Server port (default: 3000) | No |

## 🏥 Monitoring

### Health Check

```bash
curl http://localhost:3000/api/v1/test-talk/health
```

Response:
```json
{
  "status": "healthy",
  "details": {
    "accountSid": "AC...",
    "accountName": "Your Account",
    "activeCalls": 2,
    "twilioStatus": "active",
    "phoneNumber": "+1234567890"
  }
}
```

### Call Statistics

```bash
curl http://localhost:3000/api/v1/test-talk/statistics
```

Response:
```json
{
  "totalActiveCalls": 2,
  "callsByStatus": {
    "in-progress": 1,
    "ringing": 1
  },
  "callsByType": {
    "browser-to-phone": 2
  },
  "averageCallDuration": 45
}
```

## 🛡️ Security Features

- **Rate Limiting**: 5 calls per minute per identifier
- **Input Validation**: Comprehensive validation of all inputs
- **Phone Number Sanitization**: Automatic phone number formatting
- **JWT Token Security**: Secure token generation with expiration
- **Environment Variable Protection**: Sensitive data in environment variables

## 🚀 Performance Optimizations

1. **Efficient Memory Usage**: Map-based call tracking with automatic cleanup
2. **Optimized TwiML Generation**: Cached response patterns
3. **Rate Limiting**: In-memory rate limiting with periodic cleanup
4. **Configuration Caching**: Cached configuration validation
5. **Modular Architecture**: Lazy loading and dependency injection

## 🧪 Testing

Run tests:
```bash
npm test
```

Test the service:
```bash
# Health check
curl http://localhost:3000/api/v1/test-talk/health

# Get token
curl http://localhost:3000/api/v1/test-talk/token

# Make a test call
curl -X POST http://localhost:3000/api/v1/test-talk/call \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "from": "browser"}'
```

## 📝 Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run start:dev
```

### Type Checking
```bash
npx tsc --noEmit
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

1. **"Invalid Twilio credentials"**
   - Verify your `.env` file has correct Twilio credentials
   - Check that your API Key has Voice permissions

2. **"Connection failed"**
   - Ensure your webhook URLs are publicly accessible
   - Check firewall settings

3. **"Call not connecting"**
   - Verify TwiML Application configuration
   - Check phone number formatting

### Debug Mode

Set environment variable for detailed logging:
```bash
DEBUG=test-talk:* npm run start:dev
```

## 📞 Support

For issues and questions:
- Check the troubleshooting section
- Review Twilio Console for error logs
- Check application logs for detailed error messages
