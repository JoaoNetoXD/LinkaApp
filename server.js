import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Mercado Pago
// Ensure you have MP_ACCESS_TOKEN in your .env file
const mpAccessToken = process.env.MP_ACCESS_TOKEN;
if (!mpAccessToken) {
  console.warn("⚠️ AVISO: MP_ACCESS_TOKEN não encontrado no .env. Configure para testar pagamentos reais.");
}

const client = new MercadoPagoConfig({ accessToken: mpAccessToken || 'TEST-dummy-token', options: { timeout: 5000 } });
const payment = new Payment(client);

// Store payments in memory for quick polling by frontend
// In a real app, you would use a database.
const paymentsDb = new Map();

app.post('/api/pix', async (req, res) => {
  try {
    const { product, buyer, couponCode } = req.body;
    
    // In a real application, calculate the final amount securely in the backend
    // to avoid frontend tampering. Here we trust the input for simplicity.
    const amount = product.discountPrice;
    
    // Create the payment in Mercado Pago
    const body = {
      transaction_amount: amount,
      description: `Compra no Linka: ${product.title}`,
      payment_method_id: 'pix',
      payer: {
        email: buyer.email || 'test_user_linka@testuser.com',
        first_name: buyer.name || 'Comprador',
        // Depending on account rules, MP might require a valid CPF in identification
        // identification: {
        //   type: 'CPF',
        //   number: '19119119100'
        // }
      }
    };

    const mpResponse = await payment.create({ body });
    
    // Extract Pix data
    const transactionData = mpResponse.point_of_interaction?.transaction_data;
    
    if (!transactionData) {
      throw new Error("Não foi possível gerar os dados do Pix");
    }

    const qrCodeBase64 = transactionData.qr_code_base64;
    const pixCode = transactionData.qr_code;
    const paymentId = mpResponse.id.toString();

    // Calculate fees internally (for the dashboard)
    const platformFee = Math.round(amount * 0.01 * 100) / 100;
    const sellerAmount = Math.round((amount - platformFee) * 100) / 100;

    // Save payment internally for polling
    const newPayment = {
      id: paymentId,
      mpId: paymentId,
      userId: buyer?.id || 1,
      buyerName: buyer?.fullName || buyer?.name || 'Comprador',
      sellerId: product.seller?.id || product.id,
      sellerName: product.seller?.name || 'Vendedor',
      productId: product.id,
      productTitle: product.title,
      couponCode: couponCode,
      status: 'pending', // pending, paid, expired
      amount: amount,
      originalAmount: product.originalPrice,
      discount: product.discount,
      platformFee: platformFee,
      sellerAmount: sellerAmount,
      platformCommissionRate: 0.01,
      pixCode: pixCode,
      createdAt: new Date().toISOString(),
      paidAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };

    paymentsDb.set(paymentId, newPayment);

    res.json({
      success: true,
      payment: {
        id: paymentId,
        qrCodeBase64,
        pixCode,
        amount,
        status: 'pending',
        expiresAt: newPayment.expiresAt
      }
    });

  } catch (error) {
    console.error("Erro ao criar pagamento MP:", error);
    res.status(500).json({ success: false, error: 'Erro ao gerar Pix' });
  }
});

// Endpoint to check status (Polling from frontend)
app.get('/api/payment/:id', async (req, res) => {
  const { id } = req.params;
  const localPayment = paymentsDb.get(id);

  if (!localPayment) {
    return res.status(404).json({ success: false, error: 'Pagamento não encontrado' });
  }

  // If we already know it's paid, return immediately
  if (localPayment.status === 'paid') {
    return res.json({ success: true, payment: localPayment });
  }

  try {
    // Check real status in Mercado Pago
    const mpPayment = await payment.get({ id });
    
    if (mpPayment.status === 'approved') {
      localPayment.status = 'paid';
      localPayment.paidAt = new Date().toISOString();
      paymentsDb.set(id, localPayment);
    } else if (mpPayment.status === 'cancelled' || mpPayment.status === 'rejected') {
      localPayment.status = 'expired';
      paymentsDb.set(id, localPayment);
    }

    res.json({ success: true, payment: localPayment });
  } catch (error) {
    console.error("Erro ao verificar pagamento MP:", error);
    // If API call fails, return the last known status
    res.json({ success: true, payment: localPayment });
  }
});

// Endpoint to create a Checkout Pro preference (Credit Card, etc)
app.post('/api/preference', async (req, res) => {
  try {
    const { product, buyer, couponCode } = req.body;
    const amount = product.discountPrice;

    const preference = new Preference(client);
    const body = {
      items: [
        {
          id: product.id.toString(),
          title: product.title,
          quantity: 1,
          unit_price: amount,
          currency_id: 'BRL',
          description: `Cupom: ${couponCode}`
        }
      ],
      payer: {
        name: buyer.name || 'Comprador',
        email: buyer.email || 'test_user_linka@testuser.com'
      },
      back_urls: {
        success: 'https://seusite.com.br/#/buyer',
        failure: 'https://seusite.com.br/#/buyer',
        pending: 'https://seusite.com.br/#/buyer'
      }
    };

    const response = await preference.create({ body });
    
    // Save minimal info just so it appears in the dashboard
    // In a real app, you'd use webhook to update status
    const paymentId = 'PREF-' + response.id;
    const platformFee = Math.round(amount * 0.01 * 100) / 100;
    const sellerAmount = Math.round((amount - platformFee) * 100) / 100;

    paymentsDb.set(paymentId, {
      id: paymentId,
      status: 'pending',
      amount,
      platformFee,
      sellerAmount,
      productTitle: product.title,
      buyerName: buyer.name || 'Comprador',
      couponCode,
      createdAt: new Date().toISOString()
    });

    res.json({ success: true, initPoint: response.init_point });
  } catch (error) {
    console.error("Erro ao criar preferência MP:", error);
    res.status(500).json({ success: false, error: 'Erro ao gerar checkout' });
  }
});

// Optional Webhook endpoint
app.post('/api/webhook', (req, res) => {
  // We won't use it in localhost without ngrok, but it's here for completeness
  res.sendStatus(200);
});

// Endpoint to fetch seller payments (mocked query for the dashboard)
app.get('/api/seller/:sellerId/payments', (req, res) => {
  const payments = Array.from(paymentsDb.values());
  res.json({ success: true, payments });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend escutando na porta ${PORT}`);
});
