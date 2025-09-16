const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware para permitir CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

// Rota de proxy para streams de vídeo
app.get('/stream-proxy', async (req, res) => {
    const originalStreamUrl = req.query.url;

    if (!originalStreamUrl) {
        console.error('[PROXY] Erro: URL de stream não fornecido.');
        return res.status(400).send('URL de stream não fornecido.');
    }

    console.log(`[PROXY] Recebido pedido para proxificar: ${originalStreamUrl}`);

    try {
        // Objeto para armazenar os cabeçalhos que vamos enviar
        const headersToForward = {
            // Copia o 'User-Agent' do navegador do seu usuário
            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
            // Define o 'Referer' para o domínio do stream original para enganar a proteção anti-hotlink
            'Referer': new URL(originalStreamUrl).origin,
            // Copia o 'Accept-Encoding' para suportar compressão (opcional)
            'Accept-Encoding': req.headers['accept-encoding'] || 'identity'
        };

        // Faz um pedido HTTP para o stream original
        const response = await axios.get(originalStreamUrl, {
            responseType: 'stream',
            headers: headersToForward,
        });

        // Copia todos os cabeçalhos da resposta original para a resposta do proxy
        for (const key in response.headers) {
            res.setHeader(key, response.headers[key]);
        }

        // Transmite o stream do original para o cliente do proxy
        response.data.pipe(res);
        console.log(`[PROXY] A transmitir stream de ${originalStreamUrl}`);

        response.data.on('end', () => {
            console.log(`[PROXY] Stream de ${originalStreamUrl} finalizado.`);
        });

        response.data.on('error', (err) => {
            console.error(`[PROXY ERROR] Erro na transmissão do stream:`, err.message);
            if (!res.headersSent) {
                res.status(500).send('Erro ao transmitir o stream.');
            }
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
        }
        if (!res.headersSent) {
            res.status(error.response ? error.response.status : 500).send('Erro ao conectar ao stream original.');
        }
    }
});

// Rota de saúde para verificar se o proxy está ativo
app.get('/health', (req, res) => {
    res.status(200).send('Proxy está ativo!');
});

app.listen(PORT, () => {
    console.log(`Servidor Proxy a correr na porta ${PORT}`);
});