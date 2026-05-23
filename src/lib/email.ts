import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, body: string, attachments?: any[]) => {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await transporter.sendMail({
        from: `"Sistema" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: body,
        attachments,
      });
      console.log(`[Email] Generic email sent to ${to}`);
    } catch (err) {
      console.error("[Email] Failed to send generic email:", err);
    }
  } else {
    console.log(`[Email] Mocked (No SMTP creds). Sent to ${to}. Subject: ${subject}`);
  }
};

export const sendWelcomeEmail = async (to: string, name: string, companyName: string, loginUrl: string, verificationCode: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; padding: 20px; border-radius: 8px;">
      <h2 style="color: #333;">Bem-vindo ao sistema, ${name}!</h2>
      <p style="color: #555;">Sua empresa <strong>${companyName}</strong> foi provisionada com sucesso.</p>
      
      <p style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" style="padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
          Acessar Sistema
        </a>
      </p>
      
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eaeaea;" />
      
      <p style="color: #555;">Para concluir a verificação do seu e-mail, utilize o código de 6 dígitos abaixo:</p>
      <div style="text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; letter-spacing: 5px; color: #111; font-weight: bold; background-color: #f4f4f5; padding: 10px 20px; border-radius: 8px;">
          ${verificationCode}
        </span>
      </div>
      <p style="color: #777; font-size: 14px; text-align: center;">Este código expira em 30 minutos.</p>
      
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eaeaea;" />
      <p style="color: #555; font-size: 14px;">Consulte nossa <a href="https://docs.seusistema.com.br" style="color: #2563eb;">Documentação</a> para começar ou entre em contato com nosso suporte se precisar de ajuda.</p>
    </div>
  `;

  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await transporter.sendMail({
        from: `"Sistema" <${process.env.SMTP_USER}>`,
        to,
        subject: "Bem-vindo ao nosso sistema! Verifique seu e-mail",
        html,
      });
      console.log(`[Email] Welcome email sent to ${to}`);
    } catch (err) {
      console.error("[Email] Failed to send email:", err);
    }
  } else {
    console.log(`[Email] Mocked (No SMTP creds). Sent to ${to}. Code: ${verificationCode}`);
    // console.log(html);
  }
};
