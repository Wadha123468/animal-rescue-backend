const nodemailer = require('nodemailer');

// Create transporter with correct method name
const createTransporter = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration
      return nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    } else {
      // Development: Check if credentials exist
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        console.log('📧 Using provided email credentials for development');
        return nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });
      } else {
        // Use Ethereal for testing if no credentials
        console.log('📧 No email credentials found, creating test account...');
        const testAccount = await nodemailer.createTestAccount();
        
        return nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }
    }
  } catch (error) {
    console.error('❌ Error creating email transporter:', error);
    throw error;
  }
};

// Email templates for all events
const templates = {
  // 1. User Registration Welcome Email
  userWelcome: (data) => ({
    subject: data.subject || '🐾 Welcome to Animal Rescue Platform!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Animal Rescue</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🐾 Welcome to Animal Rescue!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Join our mission to save lives</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.userName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Welcome to our animal rescue community! Thank you for joining us in making a difference in the lives of animals in need.
            </p>
            
            <div style="background: #e8f5e8; border-left: 5px solid #28a745; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #28a745; margin: 0 0 20px 0; font-size: 22px;">✨ What you can do now:</h3>
              <ul style="color: #155724; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>🚨 Report animals in need of rescue</li>
                <li>📋 Track your rescue reports and their progress</li>
                <li>🏢 Find verified NGOs in your area</li>
                <li>📊 View rescue statistics and community impact</li>
                <li>💬 Connect with other animal lovers</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
                🚀 Go to Dashboard
              </a>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px; text-align: center;">
                💡 <strong>Quick Tip:</strong> You can report a rescue case anytime by clicking "Report Rescue" in your dashboard!
              </p>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Together, we can save more lives! 🐾❤️</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 2. NGO Registration Submitted (to NGO)
  ngoRegistrationSubmitted: (data) => ({
    subject: data.subject || '🏢 NGO Registration Submitted - Pending Approval',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NGO Registration Submitted</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🏢 Registration Submitted!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Thank you for joining us</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.userName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Thank you for registering <strong>${data.ngoName}</strong> with our Animal Rescue Platform! Your application has been submitted successfully.
            </p>
            
            <div style="background: #fff3cd; border-left: 5px solid #f39c12; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #f39c12; margin: 0 0 20px 0; font-size: 22px;">⏳ What happens next?</h3>
              <div style="color: #856404; line-height: 1.8;">
                <div style="margin: 10px 0; display: flex; align-items: center;">
                  <span style="background: #f39c12; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-block; text-align: center; line-height: 20px; font-size: 12px; margin-right: 15px;">1</span>
                  Our admin team will review your registration details
                </div>
                <div style="margin: 10px 0; display: flex; align-items: center;">
                  <span style="background: #f39c12; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-block; text-align: center; line-height: 20px; font-size: 12px; margin-right: 15px;">2</span>
                  We typically complete reviews within 1-2 business days
                </div>
                <div style="margin: 10px 0; display: flex; align-items: center;">
                  <span style="background: #f39c12; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-block; text-align: center; line-height: 20px; font-size: 12px; margin-right: 15px;">3</span>
                  You'll receive an email notification once approved
                </div>
                <div style="margin: 10px 0; display: flex; align-items: center;">
                  <span style="background: #f39c12; color: white; border-radius: 50%; width: 20px; height: 20px; display: inline-block; text-align: center; line-height: 20px; font-size: 12px; margin-right: 15px;">4</span>
                  Once approved, you can login and start accepting rescues
                </div>
              </div>
            </div>
            
            <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #0c5460; font-size: 14px;">
                <strong>📧 Important:</strong> Please check your email regularly for updates. You cannot login until your NGO is approved by our admin team.
              </p>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Thank you for wanting to help animals! 🐾</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
            <p style="margin: 10px 0 0 0; font-size: 12px;">Need help? Contact support@animalrescue.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 3. New Rescue Alert (to NGOs)
  newRescueAlert: (data) => ({
    subject: data.subject || `🚨 URGENT: New ${data.animalType} Rescue Alert`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Rescue Alert</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🚨 URGENT RESCUE ALERT!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">A ${data.animalType} needs your help</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.ngoName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              A new <strong>${data.animalType}</strong> rescue case has been ${data.assignmentType} in your service area. Your immediate attention could save a life!
            </p>
            
            <div style="background: #f8d7da; border-left: 5px solid #dc3545; padding: 25px; margin: 30px 0; border-radius: 8px; border: 2px solid #dc3545;">
              <h3 style="color: #dc3545; margin: 0 0 20px 0; font-size: 22px;">🐾 ${data.rescueTitle}</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; width: 30%; color: #721c24; font-weight: bold;">Animal:</td>
                  <td style="padding: 8px 0; color: #721c24; text-transform: uppercase; font-weight: bold;">🐾 ${data.animalType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #721c24; font-weight: bold;">Location:</td>
                  <td style="padding: 8px 0; color: #721c24;">📍 ${data.location}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #721c24; font-weight: bold;">Urgency:</td>
                  <td style="padding: 8px 0;">
                    <span style="background: ${data.urgency === 'critical' ? '#dc3545' : data.urgency === 'high' ? '#fd7e14' : data.urgency === 'medium' ? '#ffc107' : '#28a745'}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                      ${data.urgency}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #721c24; font-weight: bold;">Reported by:</td>
                  <td style="padding: 8px 0; color: #721c24;">👤 ${data.reporterName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #721c24; font-weight: bold;">Reported on:</td>
                  <td style="padding: 8px 0; color: #721c24;">📅 ${data.reportedDate}</td>
                </tr>
              </table>
            </div>
            
            <div style="margin: 25px 0;">
              <h4 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">📋 Case Description:</h4>
              <div style="background: #fff; border: 2px solid #dc3545; padding: 20px; border-radius: 8px; color: #721c24; line-height: 1.6;">
                ${data.description}
              </div>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #856404; margin: 0; font-size: 14px; text-align: center;">
                ⚡ <strong>TIME IS CRITICAL!</strong> Please respond as soon as possible. Every minute counts for animals in distress.
              </p>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.rescueUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 20px 45px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 20px; box-shadow: 0 4px 15px rgba(220, 53, 69, 0.4); text-transform: uppercase;">
                🚑 ACCEPT THIS RESCUE
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Thank you for being an animal hero! 🐾❤️</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 4. Rescue Assigned (to Reporter)
  rescueAssigned: (data) => ({
    subject: data.subject || `✅ Great News! Your rescue case has been assigned`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Rescue Assigned</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">✅ Excellent News!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Your rescue case has been assigned</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.reporterName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Wonderful news! Your rescue case "<strong>${data.rescueTitle}</strong>" has been assigned to a qualified NGO. They will now take care of rescuing the ${data.animalType}.
            </p>
            
            <div style="background: #d4edda; border-left: 5px solid #28a745; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #28a745; margin: 0 0 20px 0; font-size: 22px;">🏢 Assigned NGO Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; width: 35%; color: #155724; font-weight: bold;">Organization:</td>
                  <td style="padding: 10px 0; color: #155724; font-weight: bold; font-size: 18px;">${data.ngoName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #155724; font-weight: bold;">Contact Email:</td>
                  <td style="padding: 10px 0;">
                    <a href="mailto:${data.ngoEmail}" style="color: #007bff; text-decoration: none; font-weight: bold;">${data.ngoEmail}</a>
                  </td>
                </tr>
                ${data.ngoPhone ? `
                <tr>
                  <td style="padding: 10px 0; color: #155724; font-weight: bold;">Phone:</td>
                  <td style="padding: 10px 0;">
                    <a href="tel:${data.ngoPhone}" style="color: #007bff; text-decoration: none; font-weight: bold;">${data.ngoPhone}</a>
                  </td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div style="background: #cce7ff; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #007bff; margin: 0 0 10px 0;">📞 What happens next?</h4>
              <ul style="color: #004085; margin: 0; padding-left: 20px; line-height: 1.8;">
                <li>The NGO will contact you directly to coordinate the rescue</li>
                <li>They may ask for additional location details or photos</li>
                <li>You can also reach out to them using the contact information above</li>
                <li>You'll receive updates as the rescue progresses</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.rescueUrl}" style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
                📋 View Rescue Details
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Thank you for reporting and helping save a life! 🐾❤️</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 5. Status Update
  statusUpdate: (data) => ({
    subject: data.subject || `📋 Status Update: ${data.rescueTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Status Update</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #6f42c1 0%, #6610f2 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">📋 Status Update</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Your rescue case has been updated</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.reporterName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              There's an update on your rescue case "<strong>${data.rescueTitle}</strong>" for the ${data.animalType} you reported.
            </p>
            
            <div style="background: #e3f2fd; border-left: 5px solid #2196f3; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #1976d2; margin: 0 0 20px 0; font-size: 22px;">📊 Status Change</h3>
              <div style="text-align: center; margin: 20px 0;">
                <div style="display: inline-block; background: #f5f5f5; color: #666; padding: 15px 25px; border-radius: 25px; font-weight: bold; margin-right: 10px;">
                  ${data.oldStatus}
                </div>
                <span style="color: #1976d2; font-size: 24px; font-weight: bold; margin: 0 10px;">→</span>
                <div style="display: inline-block; background: #1976d2; color: white; padding: 15px 25px; border-radius: 25px; font-weight: bold; margin-left: 10px;">
                  ${data.newStatus}
                </div>
              </div>
              ${data.updateMessage ? `
                <div style="background: #fff; border: 1px solid #2196f3; padding: 15px; border-radius: 8px; margin-top: 20px;">
                  <h4 style="color: #1976d2; margin: 0 0 10px 0;">💬 Update Message:</h4>
                  <p style="color: #333; margin: 0; line-height: 1.6;">${data.updateMessage}</p>
                </div>
              ` : ''}
            </div>
            
            ${data.assignedNGO ? `
              <div style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #0c5460; font-size: 14px;">
                  <strong>🏢 Handled by:</strong> ${data.assignedNGO}
                </p>
              </div>
            ` : ''}
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.rescueUrl}" style="display: inline-block; background: linear-gradient(135deg, #6f42c1 0%, #6610f2 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
                📋 View Full Details
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Stay updated on your rescue case! 🐾</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 6. NGO Registration Alert (to Admin)
  ngoRegistrationAlert: (data) => ({
    subject: data.subject || '🚨 New NGO Registration Awaiting Approval',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #fd7e14 0%, #e67e22 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🚨 New NGO Registration</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Requires admin approval</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.adminName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              A new NGO has registered on the platform and is waiting for your approval to start helping animals in need.
            </p>
            
            <div style="background: #fff3cd; border-left: 5px solid #fd7e14; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #fd7e14; margin: 0 0 20px 0; font-size: 22px;">🏢 NGO Registration Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; width: 30%; color: #856404; font-weight: bold;">Organization:</td>
                  <td style="padding: 8px 0; color: #856404; font-weight: bold; font-size: 16px;">${data.ngoName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #856404; font-weight: bold;">Contact Email:</td>
                  <td style="padding: 8px 0; color: #856404;">${data.ngoEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #856404; font-weight: bold;">Phone:</td>
                  <td style="padding: 8px 0; color: #856404;">${data.ngoPhone || 'Not provided'}</td>
                </tr>
                ${data.registrationNumber ? `
                <tr>
                  <td style="padding: 8px 0; color: #856404; font-weight: bold;">Registration #:</td>
                  <td style="padding: 8px 0; color: #856404; font-family: monospace;">${data.registrationNumber}</td>
                </tr>
                ` : ''}
                ${data.establishedYear ? `
                <tr>
                  <td style="padding: 8px 0; color: #856404; font-weight: bold;">Established:</td>
                  <td style="padding: 8px 0; color: #856404;">${data.establishedYear}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; color: #856404; font-weight: bold;">Registered on:</td>
                  <td style="padding: 8px 0; color: #856404;">${data.registrationDate}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #155724; font-size: 14px;">
                <strong>⚡ Action Required:</strong> Please review this NGO's credentials and approve or reject their registration. Approved NGOs can immediately start accepting rescue cases.
              </p>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.approvalUrl}" style="display: inline-block; background: linear-gradient(135deg, #fd7e14 0%, #e67e22 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
                👑 Review & Approve NGO
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Admin Notification - Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 7. NGO Approved
  ngoApproved: (data) => ({
    subject: data.subject || '🎉 Congratulations! Your NGO has been approved',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🎉 Congratulations!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Your NGO has been approved</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.userName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Fantastic news! Your NGO "<strong>${data.ngoName}</strong>" has been officially approved by our admin team. You are now part of our animal rescue network!
            </p>
            
            <div style="background: #d4edda; border-left: 5px solid #28a745; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #28a745; margin: 0 0 20px 0; font-size: 22px;">✅ You can now:</h3>
              <ul style="color: #155724; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>🔐 Login to your account with full access</li>
                <li>📊 Access your dedicated NGO dashboard</li>
                <li>🚑 View and accept rescue cases in your area</li>
                <li>📋 Manage your NGO profile and capacity information</li>
                <li>💬 Communicate directly with people reporting rescues</li>
                <li>📈 Track your rescue statistics and community ratings</li>
                <li>🏆 Build your reputation as a trusted rescue organization</li>
              </ul>
            </div>
            
            <div style="background: #cce7ff; border: 1px solid #bee5eb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #004085; font-size: 14px; text-align: center;">
                🌟 <strong>Welcome to the team!</strong> You're now officially part of our mission to save animals in need. Every rescue you take makes a real difference.
              </p>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px; margin-right: 15px;">
                🔐 Login Now
              </a>
              <a href="${data.dashboardUrl}" style="display: inline-block; background: #007bff; color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
                📊 Go to Dashboard
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">Welcome to the Animal Rescue Community! 🐾</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 8. NGO Rejected
  ngoRejected: (data) => ({
    subject: data.subject || '❌ NGO Registration Status Update',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">❌ Registration Update</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Regarding your NGO application</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.userName},</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Thank you for your interest in joining the Animal Rescue Platform. Unfortunately, we cannot approve your NGO "<strong>${data.ngoName}</strong>" at this time.
            </p>
            
            <div style="background: #f8d7da; border-left: 5px solid #dc3545; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #dc3545; margin: 0 0 15px 0; font-size: 18px;">📝 Reason for rejection:</h3>
              <div style="background: #fff; border: 1px solid #dc3545; padding: 15px; border-radius: 5px;">
                <p style="color: #721c24; margin: 0; line-height: 1.6; font-style: italic;">"${data.rejectionReason}"</p>
              </div>
            </div>
            
            <div style="background: #cce7ff; border-left: 5px solid #007bff; padding: 20px; margin: 30px 0; border-radius: 8px;">
              <h4 style="color: #007bff; margin: 0 0 15px 0;">💡 What you can do next:</h4>
              <ul style="color: #004085; margin: 0; line-height: 1.8; padding-left: 20px;">
                <li>Review the feedback provided above carefully</li>
                <li>Address the specific concerns mentioned</li>
                <li>Gather any additional documentation or certifications</li>
                <li>Contact our support team if you need clarification</li>
                <li>Reapply once you've addressed the issues</li>
              </ul>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px; text-align: center;">
                🤝 <strong>We value your commitment</strong> to animal welfare. Please don't be discouraged - we're here to help you meet our requirements.
              </p>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="mailto:${data.supportEmail}" style="display: inline-block; background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; margin-right: 15px;">
                📞 Contact Support
              </a>
              <a href="${data.reapplyUrl}" style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                📝 Apply Again
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">We appreciate your dedication to animal welfare 🐾</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // 9. Account Deletion Confirmation

accountDeleted: (data) => ({
  subject: data.subject || '🗑️ Account Deletion Confirmation',
  html: `
    <!DOCTYPE html>
    <html>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- ... existing header ... -->
        
        <div style="padding: 40px 30px;">
          <h2 style="color: #333; margin-top: 0; font-size: 24px;">Goodbye ${data.userName},</h2>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
            Your account has been successfully deleted from our Animal Rescue Platform. We're sad to see you go, but we respect your decision.
          </p>
          
          <div style="background: #f8d7da; border-left: 5px solid #dc3545; padding: 25px; margin: 30px 0; border-radius: 8px;">
            <h3 style="color: #721c24; margin: 0 0 15px 0;">🗑️ What was deleted:</h3>
            <ul style="color: #721c24; margin: 0; line-height: 1.8; padding-left: 20px;">
              <li>Your user account and profile information</li>
              ${data.ngoDeleted ? `<li>Your NGO "${data.ngoName || 'organization'}" profile and data</li>` : ''}
              <li>All personal and contact information</li>
              <li>Login credentials and access permissions</li>
            </ul>
          </div>
          
          <div style="background: #d1ecf1; border-left: 5px solid #17a2b8; padding: 20px; margin: 30px 0; border-radius: 8px;">
            <h4 style="color: #0c5460; margin: 0 0 15px 0;">📊 What was preserved:</h4>
            <ul style="color: #0c5460; margin: 0; line-height: 1.8; padding-left: 20px;">
              <li>Rescue reports (anonymized for statistical purposes)</li>
              ${data.ngoDeleted ? '<li>Assigned rescue cases (reassigned to other NGOs)</li>' : ''}
              <li>Platform usage statistics for system improvement</li>
            </ul>
          </div>
          
          <!-- ... rest of template ... -->
        </div>
      </div>
    </body>
    </html>
  `
})

};

// Send email function with retry logic
const sendEmail = async ({ to, subject, template, data }) => {
  let retries = 3;
  
  while (retries > 0) {
    try {
      console.log(`📧 Attempting to send email to: ${to}, Template: ${template}`);
      
      const transporter = await createTransporter();
      
      // Verify connection
      await transporter.verify();
      console.log('✅ Email transporter verified successfully');
      
      const templateFunction = templates[template];
      if (!templateFunction) {
        throw new Error(`Template '${template}' not found. Available templates: ${Object.keys(templates).join(', ')}`);
      }
      
      const emailContent = templateFunction({ ...data, subject });
      
      const mailOptions = {
        from: `"🐾 Animal Rescue Platform" <${process.env.EMAIL_USER || 'noreply@animalrescue.com'}>`,
        to,
        subject: emailContent.subject,
        html: emailContent.html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', {
        messageId: info.messageId,
        to: to,
        template: template,
        subject: emailContent.subject
      });
      
      // Show preview URL for development
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl && process.env.NODE_ENV !== 'production') {
        console.log('📧 Email preview URL:', previewUrl);
      }
      
      return { 
        success: true, 
        messageId: info.messageId, 
        preview: previewUrl 
      };
      
    } catch (error) {
      retries--;
      console.error(`❌ Email sending failed (${retries} retries left):`, error.message);
      
      if (retries === 0) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

// Send bulk emails
const sendBulkEmail = async ({ recipients, subject, template, baseData }) => {
  const results = [];
  
  console.log(`📧 Sending bulk emails to ${recipients.length} recipients`);
  
  for (const recipient of recipients) {
    try {
      const result = await sendEmail({
        to: recipient.email,
        subject,
        template,
        data: { ...baseData, ...recipient }
      });
      
      results.push({
        email: recipient.email,
        success: result.success,
        messageId: result.messageId
      });
    } catch (error) {
      results.push({
        email: recipient.email,
        success: false,
        error: error.message
      });
    }
  }
  
  const successful = results.filter(r => r.success).length;
  console.log(`✅ Bulk email complete: ${successful}/${recipients.length} sent successfully`);
  
  return results;
};

// Test email function
const sendTestEmail = async () => {
  try {
    console.log('🧪 Testing email service...');
    
    const testEmail = process.env.EMAIL_USER || 'test@example.com';
    
    const result = await sendEmail({
      to: testEmail,
      template: 'userWelcome',
      data: {
        userName: 'Test User',
        dashboardUrl: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/dashboard'
      }
    });
    
    console.log('✅ Test email sent successfully!');
    return result;
    
  } catch (error) {
    console.error('❌ Test email failed:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  sendBulkEmail,
  sendTestEmail
};
