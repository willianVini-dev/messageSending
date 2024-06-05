
const venom = require('venom-bot');
const XLSX = require('xlsx');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors')

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './'); 
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + req.params.session + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

const app = express();
const port = 3000;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let clients = {};

// Função para criar e retornar uma instância do Venom
async function createClient(sessionName, res) {
  return venom.create(
    sessionName,
    (base64Qr) => {
      const matches = base64Qr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches.length !== 3) {
        return res.status(500).send('Erro ao processar o QR Code.');
      }
      const response = {
        type: matches[1],
        data: Buffer.from(matches[2], 'base64'),
      };

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': response.data.length,
      });
      res.end(response.data); // Envia o QR Code como imagem PNG
    },
    undefined,
    { logQR: false }
  );
}

// Função para iniciar o processo de envio de mensagens via WhatsApp
async function startWhatsAppProcess(sessionName, message, image,res) {
  try {
    const client = clients[sessionName];

    function sendText(number, message) {
      client
        .sendText(number, message)
        .catch((error) => {
          console.error('Erro ao enviar mensagem:', error);
        });
    }
    function sendImage(number, imagePath, caption) {
      client
        .sendImage(number, imagePath, 'image', caption)
        .catch((error) => {
          console.error('Erro ao enviar imagem:', error);
        });
    }

    const filePath = path.join(__dirname, `file${sessionName}.csv`);
    const workbook = XLSX.readFile(filePath);
    const sheet_name_list = workbook.SheetNames;
    const worksheet = workbook.Sheets[sheet_name_list[0]];

    // Converter os dados da planilha para um array de objetos
    const data = XLSX.utils.sheet_to_json(worksheet);

    data.forEach((contact) => {
    
      const phoneNumber = `55${contact['Telefone 1']}@c.us`;
      // Adicione o caminho da imagem que você deseja enviar
      if(image){
        const imagePath = path.join(__dirname, `image/${image}.png`);
        sendImage(phoneNumber, imagePath, message);
      }else{
        sendText(phoneNumber, message);
      }
    });

    res.send('Arquivo e mensagem recebidos com sucesso.');

    // Remover o arquivo após o envio
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Erro ao remover o arquivo:', err);
        return;
      }
      console.log('Arquivo removido com sucesso');
    });
  } catch (error) {
    console.error(`Erro ao criar o cliente Venom para a sessão ${sessionName}:`, error);
    res.status(500).send(`Erro ao criar o cliente Venom para a sessão ${sessionName}.`);
  }
}

// Rota para obter o QR Code como imagem para múltiplos clientes
app.get('/qrcode/:session', async (req, res) => {
  const sessionName = req.params.session;
  try {
    if(clients[sessionName]){
      res.json({ connected: true });
      return
    }

    clients[sessionName] = await createClient(sessionName, res);
    return
    //res.send(`QR Code gerado para sessão ${sessionName}. Verifique os logs do servidor para escanear o QR Code.`);

  } catch (error) {
    console.error(`Erro ao criar o cliente Venom para a sessão ${sessionName}:`, error);
    res.status(500).send(`Erro ao criar o cliente Venom para a sessão ${sessionName}.`);
  }
});

// Rota para checar se já está conectado
app.get('/connected/:session', async (req, res) => {
  const sessionName = req.params.session;
  try {
    const client = clients[sessionName];
    const isConnected = client ? await client.isConnected() : false;
    res.json({ connected: isConnected });
  } catch (error) {
    console.error(`Erro ao verificar estado de conexão da sessão ${sessionName}:`, error);
    res.status(500).send(`Erro ao verificar estado de conexão da sessão ${sessionName}.`);
  }
});


// Rota POST que recebe um arquivo XLSX
app.post('/upload/:session', upload.single('file'), (req, res) => {
  const file = req.file;
  console.log(req.file);

  if (!file) {
    return res.status(400).send('Por favor, forneça um arquivo CSV.');
  }

  res.json({message:true})
});

// Rota POST que recebe uma mensagem
app.post('/message/:session', (req, res) => {
  const sessionName = req.params.session;
  const message = req.body.message;
  const image = req.body.image;
  if (!message) {
    return res.status(400).send('Por favor, forneça uma mensagem.');
  }
  // Iniciar o processo de enviar mensagens após o upload do arquivo
  startWhatsAppProcess(sessionName, message,image,res);
});

// Iniciando o servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});