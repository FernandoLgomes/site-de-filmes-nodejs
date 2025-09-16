const express = require('express');
const axios = require('axios');
const app = express();
// Use a porta fornecida pelo ambiente (Render define a PORTA para você) ou 4000 como fallback.
const PORT = process.env.PORT || 4000;

// Middleware para permitir CORS (Cross-Origin Resource Sharing)
// Permite que o seu site principal (HTTPS) acesse este proxy.
// Em produção, você pode querer restringir "*", por exemplo, para "https://seusite.com".
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
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

    // --- Crie um objeto de cabeçalhos para encaminhar ---
    // Encaminhar cabeçalhos importantes do cliente para o servidor de origem
    const headersToForward = {
        // Copia o User-Agent do cliente (seu site)
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
        // Copia o Referer do cliente (seu site). Se não houver, usa o URL do stream como fallback.
        'Referer': req.headers['referer'] || originalStreamUrl,
        // Encaminha Accept-Encoding, que pode ser necessário para compressão
        'Accept-Encoding': req.headers['accept-encoding'] || 'br, gzip'
    };
    // --- Fim do encaminhamento de cabeçalhos ---

    try {
        // Faz um pedido HTTP para o stream original com os cabeçalhos encaminhados
        const response = await axios.get(originalStreamUrl, {
            responseType: 'stream', // Essencial para lidar com streams de vídeo
            headers: headersToForward, // Passe os cabeçalhos copiados
        });

        // Configura os cabeçalhos da resposta do proxy para o cliente
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        } else {
            // Fallback caso o Content-Type não seja fornecido
            res.setHeader('Content-Type', 'video/mp4');
        }

        // Copia outros cabeçalhos importantes para a reprodução do vídeo
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        if (response.headers['accept-ranges']) {
            res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
        }
        // Copia o content-encoding se presente, pois pode ser necessário para a decodificação
        if (response.headers['content-encoding']) {
            res.setHeader('Content-Encoding', response.headers['content-encoding']);
        }

        // Transmite o stream do servidor original para o cliente do proxy
        response.data.pipe(res);
        console.log(`[PROXY] Transmitindo stream de ${originalStreamUrl}`);

        // --- Manipulação de eventos do stream ---
        response.data.on('end', () => {
            console.log(`[PROXY] Stream de ${originalStreamUrl} finalizado.`);
        });

        response.data.on('error', (err) => {
            console.error(`[PROXY ERROR] Erro na transmissão do stream de ${originalStreamUrl}:`, err.message);
            // Tenta fechar a resposta do cliente se o stream falhar e a resposta ainda não tiver sido enviada
            if (!res.headersSent) {
                res.status(500).send('Erro ao transmitir o stream.');
            }
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original ${originalStreamUrl}:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
            // Tenta logar os dados da resposta em caso de erro para depuração
            try {
                console.error(`[PROXY ERROR] Dados da Resposta:`, error.response.data);
            } catch (e) {
                console.error(`[PROXY ERROR] Não foi possível ler os dados da resposta.`);
            }
        }
        // Se a resposta ainda não foi enviada, retorna um erro apropriado ao cliente
        if (!res.headersSent) {
            res.status(error.response ? error.response.status : 500).send('Erro ao conectar ao stream original.');
        }
    }
});

// Rota de saúde para verificar se o proxy está ativo
app.get('/health', (req, res) => {
    res.status(200).send('Proxy está ativo!');
});

// Inicia o servidor na porta definida
app.listen(PORT, () => {
    console.log(`Servidor Proxy rodando em http://localhost:${PORT}`);
    console.log(`Teste o proxy em: http://localhost:${PORT}/stream-proxy?url=http://exemplo.com/seu-video.mp4`);
});