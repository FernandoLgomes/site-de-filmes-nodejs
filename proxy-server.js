// proxy-server.js
// Este é um servidor proxy dedicado para retransmitir streams HTTP para HTTPS

const express = require('express');
const axios = require('axios'); // Para fazer a requisição ao stream original
const app = express();
const PORT = process.env.PORT || 4000; // Usa a porta fornecida pelo ambiente (ou 4000 como fallback)

// Middleware para permitir CORS (Cross-Origin Resource Sharing)
// Permite que o seu site principal (HTTPS) acesse este proxy
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); // Permite qualquer origem. Em produção, você pode querer restringir.
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

// Rota de proxy para streams de vídeo
app.get('/stream-proxy', async (req, res) => {
    const originalStreamUrl = req.query.url; // Pega o URL do stream original do parâmetro 'url'

    if (!originalStreamUrl) {
        console.error('[PROXY] Erro: URL de stream não fornecido.');
        return res.status(400).send('URL de stream não fornecido.');
    }

    console.log(`[PROXY] Recebido pedido para proxify: ${originalStreamUrl}`);

    try {
        // Faz um pedido HTTP para o stream original
        const response = await axios.get(originalStreamUrl, {
            responseType: 'stream', // Importante para lidar com streams grandes
            headers: {
                // Opcional: copie cabeçalhos importantes do pedido original, se souber quais são necessários
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
            }
        });

        // Configura os cabeçalhos da resposta do proxy
       
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        } else {
            // Fallback se Content-Type não for fornecido (tentar adivinhar para MP4)
            res.setHeader('Content-Type', 'video/mp4'); 
        }
        
        // Copia outros cabeçalhos relevantes, como Content-Length se presente
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        if (response.headers['accept-ranges']) {
            res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
        }

        // Transmite o stream do original para o cliente do proxy
        response.data.pipe(res);
        console.log(`[PROXY] A transmitir stream de ${originalStreamUrl}`);

        response.data.on('end', () => {
            console.log(`[PROXY] Stream de ${originalStreamUrl} finalizado.`);
        });

        response.data.on('error', (err) => {
            console.error(`[PROXY ERROR] Erro na transmissão do stream de ${originalStreamUrl}:`, err.message);
            res.status(500).send('Erro ao transmitir o stream.');
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original ${originalStreamUrl}:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
            console.error(`[PROXY ERROR] Dados da Resposta:`, error.response.data);
        }
        res.status(error.response ? error.response.status : 500).send('Erro ao conectar ao stream original.');
    }
});

// Rota de saúde para verificar se o proxy está ativo
app.get('/health', (req, res) => {
    res.status(200).send('Proxy está ativo!');
});

app.listen(PORT, () => {
    console.log(`Servidor Proxy a correr em http://localhost:${PORT}`);
    console.log(`Pode testar o proxy em: http://localhost:${PORT}/stream-proxy?url=http://exemplo.com/seu-video.mp4`);
});
