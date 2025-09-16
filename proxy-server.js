// Rota de proxy para streams de vídeo
app.get('/stream-proxy', async (req, res) => {
    const originalStreamUrl = req.query.url; // Pega o URL do stream original do parâmetro 'url'

    if (!originalStreamUrl) {
        console.error('[PROXY] Erro: URL de stream não fornecido.');
        return res.status(400).send('URL de stream não fornecido.');
    }

    console.log(`[PROXY] Recebido pedido para proxify: ${originalStreamUrl}`);

    // --- INÍCIO DA ALTERAÇÃO ---
    // Crie um objeto de cabeçalhos para encaminhar
    const headersToForward = {
        // Copia o User-Agent do cliente (seu site)
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36',
        // Copia o Referer do cliente (seu site)
        // Se o Referer não estiver presente, use o URL do stream como fallback
        'Referer': req.headers['referer'] || originalStreamUrl,
        // Você pode adicionar outros cabeçalhos se necessário, como 'Accept-Encoding'
        'Accept-Encoding': req.headers['accept-encoding'] || 'br, gzip'
    };
    // --- FIM DA ALTERAÇÃO ---

    try {
        // Faz um pedido HTTP para o stream original
        const response = await axios.get(originalStreamUrl, {
            responseType: 'stream', // Importante para lidar com streams grandes
            headers: headersToForward, // Passe os cabeçalhos copiados
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
        // Copiar outros cabeçalhos que o servidor de origem possa exigir para continuar o stream (como 'content-encoding')
        if (response.headers['content-encoding']) {
            res.setHeader('Content-Encoding', response.headers['content-encoding']);
        }


        // Transmite o stream do original para o cliente do proxy
        response.data.pipe(res);
        console.log(`[PROXY] A transmitir stream de ${originalStreamUrl}`);

        response.data.on('end', () => {
            console.log(`[PROXY] Stream de ${originalStreamUrl} finalizado.`);
        });

        response.data.on('error', (err) => {
            console.error(`[PROXY ERROR] Erro na transmissão do stream de ${originalStreamUrl}:`, err.message);
            // Tente fechar a resposta do cliente se houver um erro na stream
            if (!res.headersSent) {
                res.status(500).send('Erro ao transmitir o stream.');
            }
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original ${originalStreamUrl}:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
            // Tente logar os dados da resposta se houver
            try {
                console.error(`[PROXY ERROR] Dados da Resposta:`, error.response.data);
            } catch (e) {
                console.error(`[PROXY ERROR] Não foi possível ler os dados da resposta.`);
            }
        }
        // Se a resposta ainda não foi enviada, envie um erro apropriado
        if (!res.headersSent) {
            res.status(error.response ? error.response.status : 500).send('Erro ao conectar ao stream original.');
        }
    }
});