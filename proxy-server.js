const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 4000;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.get('/stream-proxy', async (req, res) => {
    const originalStreamUrl = req.query.url;

    if (!originalStreamUrl) {
        console.error('[PROXY] Erro: URL de stream não fornecido.');
        return res.status(400).send('URL de stream não fornecido.');
    }

    console.log(`[PROXY] Recebido pedido para proxify: ${originalStreamUrl}`);

    try {
        // --- INÍCIO DA MODIFICAÇÃO ---
        // Captura os cabeçalhos relevantes do request original do cliente
        const clientUserAgent = req.headers['user-agent'];
        const clientReferer = req.headers['referer'] || originalStreamUrl; // Usa o URL original como fallback para o Referer

        // Define os cabeçalhos a serem enviados para o servidor de origem
        const headersToForward = {
            'User-Agent': clientUserAgent,
            'Referer': clientReferer,
            // Você pode adicionar outros cabeçalhos aqui se necessário, como 'Accept-Encoding'
            'Accept-Encoding': req.headers['accept-encoding'] || 'identity', // Passa o accept-encoding do cliente
        };
        // --- FIM DA MODIFICAÇÃO ---

        const response = await axios.get(originalStreamUrl, {
            responseType: 'stream',
            headers: headersToForward, // Usa os cabeçalhos que capturamos
        });

        // Configura os cabeçalhos da resposta do proxy
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        } else {
            res.setHeader('Content-Type', 'video/mp4'); // Fallback
        }

        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        if (response.headers['accept-ranges']) {
            res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
        }
        // Copia outros cabeçalhos úteis, como 'content-disposition' se houver
        if (response.headers['content-disposition']) {
            res.setHeader('Content-Disposition', response.headers['content-disposition']);
        }


        response.data.pipe(res);
        console.log(`[PROXY] A transmitir stream de ${originalStreamUrl}`);

        response.data.on('end', () => {
            console.log(`[PROXY] Stream de ${originalStreamUrl} finalizado.`);
        });

        response.data.on('error', (err) => {
            console.error(`[PROXY ERROR] Erro na transmissão do stream de ${originalStreamUrl}:`, err.message);
            // Tenta enviar um status 500 se a conexão ainda estiver ativa
            if (!res.headersSent) {
                res.status(500).send('Erro ao transmitir o stream.');
            }
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original ${originalStreamUrl}:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
            console.error(`[PROXY ERROR] Dados da Resposta:`, error.response.data); // Pode mostrar a página de erro do servidor
            // Tenta enviar o status correto do erro original, se a resposta ainda não foi enviada
            if (!res.headersSent) {
                res.status(error.response.status).send(`Erro ao conectar ao stream original: ${error.response.status} ${error.response.statusText}`);
            }
        } else {
            // Erro de rede ou outro erro inesperado
            if (!res.headersSent) {
                res.status(500).send('Erro inesperado ao conectar ao stream original.');
            }
        }
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('Proxy está ativo!');
});

app.listen(PORT, () => {
    console.log(`Servidor Proxy a correr em http://localhost:${PORT}`);
});