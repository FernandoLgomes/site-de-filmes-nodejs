const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware para permitir CORS (Cross-Origin Resource Sharing)
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

    // --- MELHORIA: Crie um objeto de cabeçalhos para encaminhar ---
    const headersToForward = {
        // 1. User-Agent: Copia do cliente (seu site) ou um padrão de navegador.
        //    É comum que servidores bloqueiem requisições sem User-Agent ou com User-Agents genéricos demais.
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0', // Use um User-Agent mais recente ou o do cliente

        // 2. Referer: Crucial para evitar hotlinking. Copia do cliente.
        //    Se o Referer não estiver presente (o que é incomum vindo de um navegador), use o próprio URL do stream
        //    como fallback para tentar "enganar" o servidor.
        'Referer': req.headers['referer'] || originalStreamUrl,

        // 3. Accept: Informa ao servidor quais tipos de conteúdo o cliente pode processar.
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',

        // 4. Accept-Encoding: Informa quais métodos de compressão o cliente suporta.
        //    O servidor pode usar isso para enviar dados compactados (como gzip ou brotli).
        'Accept-Encoding': req.headers['accept-encoding'] || 'br, gzip, deflate',

        // 5. Accept-Language: Preferência de idioma do cliente.
        'Accept-Language': req.headers['accept-language'] || 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',

        // 6. Connection: Geralmente 'keep-alive' para requisições persistentes.
        'Connection': req.headers['connection'] || 'keep-alive',

        // Adicione outros cabeçalhos que o servidor de origem possa estar verificando
        // Por exemplo, alguns servidores verificam 'Origin' se houver CORS sendo ativado
        // 'Origin': req.headers['origin'] || 'null', // 'null' é comum quando a requisição vem de um script local ou quando CORS é configurado amplamente
    };
    // --- FIM DA MELHORIA ---

    try {
        // Faz um pedido HTTP para o stream original usando os cabeçalhos simulados
        const response = await axios.get(originalStreamUrl, {
            responseType: 'stream', // Importante para lidar com streams grandes
            headers: headersToForward, // Passe os cabeçalhos simulados
            // É fundamental que 'axios' não remova ou altere os cabeçalhos que você está definindo.
            // Por padrão, axios remove 'Accept-Encoding', então é importante repassá-lo.
        });

        // --- Configura os cabeçalhos da resposta do proxy para o cliente ---
        // O objetivo é repassar os cabeçalhos relevantes que o navegador do cliente espera.

        // Passa o Content-Type. Se não vier, usa um fallback.
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        } else {
            res.setHeader('Content-Type', 'video/mp4'); // Fallback genérico
        }

        // Passa o Content-Length se disponível.
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }
        // Passa o Accept-Ranges para permitir seeking (avanço/retrocesso no vídeo).
        if (response.headers['accept-ranges']) {
            res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
        }
        // Passa o Content-Encoding. Se o servidor de origem enviou um stream compactado (ex: gzip),
        // você precisa repassar isso para que o navegador saiba como descompactar.
        if (response.headers['content-encoding']) {
            res.setHeader('Content-Encoding', response.headers['content-encoding']);
        }
        // Outros cabeçalhos importantes que o navegador pode precisar:
        // ETag, Last-Modified, Cache-Control, etc.
        // Se precisar deles, adicione condições similares às acima.

        // Transmite o stream do servidor original para o cliente do proxy
        response.data.pipe(res);
        console.log(`[PROXY] A transmitir stream de ${originalStreamUrl}`);

        // Lida com eventos de fim e erro na stream original
        response.data.on('end', () => {
            console.log(`[PROXY] Stream de ${originalStreamUrl} finalizado.`);
        });

        response.data.on('error', (err) => {
            console.error(`[PROXY ERROR] Erro na transmissão do stream de ${originalStreamUrl}:`, err.message);
            // Tenta fechar a resposta do cliente se houver um erro na stream
            if (!res.headersSent) {
                res.status(500).send('Erro ao transmitir o stream.');
            }
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original ${originalStreamUrl}:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
            // Tente logar os dados da resposta se houver (pode ser HTML de erro, JSON, etc.)
            try {
                // Tenta converter para string para logs mais limpos
                const responseData = typeof error.response.data === 'string'
                    ? error.response.data
                    : JSON.stringify(error.response.data);
                console.error(`[PROXY ERROR] Dados da Resposta:`, responseData);
            } catch (e) {
                console.error(`[PROXY ERROR] Não foi possível ler/logar os dados da resposta.`);
            }
        }
        // Se a resposta ainda não foi enviada, envie um erro apropriado para o cliente.
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
    console.log(`Servidor Proxy a correr em http://localhost:${PORT}`);
    console.log(`Pode testar o proxy em: http://localhost:${PORT}/stream-proxy?url=http://exemplo.com/seu-video.mp4`);
});