const nodemailer = require('nodemailer');

// Create transporter with correct method name
const createTransporter = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      // Production email configuration
      return nodemailer.createTransport({ // ← Fixed: createTransport not createTransporter
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
        return nodemailer.createTransport({ // ← Fixed: createTransport not createTransporter
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
        
        return nodemailer.createTransport({ // ← Fixed: createTransport not createTransporter
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

// Email templates
const templates = {
  newRescueAlert: (data) => ({
    subject: data.subject,
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
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🚨 New Rescue Alert!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">A new rescue case needs your expertise</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.ngoName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              A new <strong>${data.animalType}</strong> rescue case has been reported in your service area. Your immediate attention could save a life!
            </p>
            
            <div style="background: #f8f9fa; border-left: 5px solid #667eea; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 22px;">🐾 ${data.rescueTitle}</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; width: 30%; color: #666; font-weight: bold;">Animal:</td>
                  <td style="padding: 8px 0; color: #333; text-transform: uppercase; font-weight: bold;">${data.animalType}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Location:</td>
                  <td style="padding: 8px 0; color: #333;">${data.location}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Urgency:</td>
                  <td style="padding: 8px 0;">
                    <span style="background: ${data.urgency === 'critical' ? '#e74c3c' : data.urgency === 'high' ? '#f39c12' : data.urgency === 'medium' ? '#3498db' : '#27ae60'}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                      ${data.urgency}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Reported by:</td>
                  <td style="padding: 8px 0; color: #333;">${data.reporterName}</td>
                </tr>
              </table>
            </div>
            
            <div style="margin: 25px 0;">
              <h4 style="color: #333; margin: 0 0 15px 0; font-size: 16px;">Case Description:</h4>
              <div style="background: #fff; border: 1px solid #ddd; padding: 20px; border-radius: 8px; color: #666; line-height: 1.6;">
                ${data.description}
              </div>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.rescueUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                🚑 Take This Rescue Case
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

  rescueAssigned: (data) => ({
    subject: data.subject,
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
          <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">✅ Excellent News!</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Your rescue case has been assigned</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.reporterName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Wonderful news! Your rescue case "<strong>${data.rescueTitle}</strong>" has been assigned to a qualified NGO. They will now take care of rescuing the ${data.animalType}.
            </p>
            
            <div style="background: #e8f5e8; border-left: 5px solid #28a745; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #28a745; margin: 0 0 20px 0; font-size: 22px;">🏢 Assigned NGO Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 10px 0; width: 35%; color: #666; font-weight: bold;">Organization:</td>
                  <td style="padding: 10px 0; color: #333; font-weight: bold;">${data.ngoName}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #666; font-weight: bold;">Contact Email:</td>
                  <td style="padding: 10px 0;">
                    <a href="mailto:${data.ngoEmail}" style="color: #007bff; text-decoration: none;">${data.ngoEmail}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; color: #666; font-weight: bold;">Phone:</td>
                  <td style="padding: 10px 0;">
                    <a href="tel:${data.ngoPhone}" style="color: #007bff; text-decoration: none; font-weight: bold;">${data.ngoPhone}</a>
                  </td>
                </tr>
              </table>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>Next Steps:</strong> The NGO will contact you directly to coordinate the rescue. You can also reach out to them using the contact information above.
              </p>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.rescueUrl}" style="display: inline-block; background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
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

  statusUpdate: (data) => ({
    subject: data.subject,
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
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center;">
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
                <span style="background: #f5f5f5; color: #666; padding: 10px 20px; border-radius: 25px; font-weight: bold;">
                  ${data.oldStatus}
                </span>
                <span style="color: #1976d2; font-size: 24px; font-weight: bold; margin: 0 10px;">→</span>
                <span style="background: #1976d2; color: white; padding: 10px 20px; border-radius: 25px; font-weight: bold;">
                  ${data.newStatus}
                </span>
              </div>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.rescueUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
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

    ngoRegistrationAlert: (data) => ({
    subject: data.subject,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 40px 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; font-weight: bold;">🏢 New NGO Registration</h1>
            <p style="margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">Requires admin approval</p>
          </div>
          
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${data.adminName}!</h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              A new NGO has registered on the platform and is waiting for your approval.
            </p>
            
            <div style="background: #fff3cd; border-left: 5px solid #f39c12; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #f39c12; margin: 0 0 20px 0; font-size: 22px;">🏢 NGO Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; width: 30%; color: #666; font-weight: bold;">Organization:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold;">${data.ngoName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Contact Email:</td>
                  <td style="padding: 8px 0; color: #333;">${data.ngoEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Phone:</td>
                  <td style="padding: 8px 0; color: #333;">${data.ngoPhone || 'Not provided'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Registration Date:</td>
                  <td style="padding: 8px 0; color: #333;">${data.registrationDate}</td>
                </tr>
              </table>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.approvalUrl}" style="display: inline-block; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
                👑 Review & Approve
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

  ngoApproved: (data) => ({
    subject: data.subject,
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
              Great news! Your NGO "<strong>${data.ngoName}</strong>" has been approved by our admin team. You can now access all features of the Animal Rescue Platform.
            </p>
            
            <div style="background: #d4edda; border-left: 5px solid #28a745; padding: 25px; margin: 30px 0; border-radius: 8px;">
              <h3 style="color: #28a745; margin: 0 0 20px 0; font-size: 22px;">✅ What you can do now:</h3>
              <ul style="color: #155724; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>Login to your account and access the NGO dashboard</li>
                <li>View and take on rescue cases in your area</li>
                <li>Manage your NGO profile and capacity</li>
                <li>Communicate with users who report rescues</li>
                <li>Track your rescue statistics and ratings</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${data.loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px; margin-right: 15px;">
                🔐 Login Now
              </a>
              <a href="${data.dashboardUrl}" style="display: inline-block; background: #17a2b8; color: white; padding: 18px 40px; text-decoration: none; border-radius: 30px; font-weight: bold; font-size: 18px;">
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

  ngoRejected: (data) => ({
    subject: data.subject,
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
              <p style="color: #721c24; margin: 0; line-height: 1.6;">${data.rejectionReason}</p>
            </div>
            
            <div style="background: #cce7ff; border-left: 5px solid #007bff; padding: 20px; margin: 30px 0; border-radius: 8px;">
              <h4 style="color: #007bff; margin: 0 0 10px 0;">💡 Next Steps:</h4>
              <p style="color: #004085; margin: 0; font-size: 14px; line-height: 1.6;">
                If you believe this was a mistake or if you can address the concerns mentioned above, please contact our support team at 
                <a href="mailto:${data.supportEmail}" style="color: #007bff;">${data.supportEmail}</a>. 
                You may also reapply once you've addressed the issues.
              </p>
            </div>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="mailto:${data.supportEmail}" style="display: inline-block; background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px; margin-right: 15px;">
                📞 Contact Support
              </a>
              <a href="${data.reapplyUrl}" style="display: inline-block; background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                📝 Reapply
              </a>
            </div>
          </div>
          
          <div style="background: #f8f9fa; border-top: 1px solid #eee; padding: 30px; text-align: center; color: #666;">
            <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">We appreciate your commitment to animal welfare 🐾</p>
            <p style="margin: 0; font-size: 14px;">Animal Rescue Platform</p>
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
      console.log(`📧 Attempting to send email to: ${to}`);
      
      const transporter = await createTransporter();
      
      // Verify connection
      await transporter.verify();
      console.log('✅ Email transporter verified successfully');
      
      const templateFunction = templates[template];
      if (!templateFunction) {
        throw new Error(`Template '${template}' not found`);
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
        subject: subject
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

// Test email function
const sendTestEmail = async () => {
  try {
    console.log('🧪 Testing email service...');
    
    const testEmail = process.env.EMAIL_USER || 'test@example.com';
    
    const result = await sendEmail({
      to: testEmail,
      subject: '🧪 Test Email - Animal Rescue Platform',
      template: 'statusUpdate',
      data: {
        reporterName: 'Test User',
        rescueTitle: 'Test Rescue Case for System Verification',
        animalType: 'cat',
        oldStatus: 'REPORTED',
        newStatus: 'RESCUED',
        rescueUrl: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/rescues/test'
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
  sendTestEmail
};
