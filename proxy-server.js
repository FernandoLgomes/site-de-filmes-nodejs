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
        
        // *** AQUI ESTÁ A CHAVE ***
        // Se a requisição vier do seu próprio site (local ou Render),
        // NÃO envie o cabeçalho Referer original, pois ele pode ser bloqueado.
        // Enviaremos um Referer genérico ou nenhum.
        // Se a requisição for para o seu site, o 'referer' virá do navegador do usuário.
        // Se a requisição for uma solicitação direta ao proxy sem um referer de uma página específica,
        // o 'referer' pode ser indefinido ou algo diferente.
        // Precisamos garantir que o servidor de origem não receba um 'referer' que ele bloqueia.

        // Vamos tentar remover ou substituir o Referer.
        // Se o seu 'proxy-test' local envia um Referer válido, é bom mantê-lo para testes.
        // Mas para o deploy no Render, precisamos ter cuidado.

        // Opção mais segura para o Render: Remove o Referer
        // 'Referer': null, 

        // Opção que pode funcionar para ambos (teste local e Render, se o servidor aceitar):
        // Tenta encaminhar o referer do cliente se ele existir, mas se for o seu próprio domínio,
        // ele pode precisar ser tratado de forma diferente.
        // Para simplificar agora, vamos focar em garantir que não bloqueie no Render.
        // Se o req.headers['referer'] for o seu domínio proxy (render.com), tente removê-lo.
        // Caso contrário, se for uma requisição direta ou de outro lugar, pode ser que precise.

        // Vamos tentar REMOVER o Referer se ele for do seu domínio atual (render.com ou localhost)
        // Isso é um pouco complexo, pois precisamos saber o domínio atual.
        // Para o teste atual, vamos APENAS remover o 'Referer' se ele parecer vir do seu próprio proxy.
        // Se o seu site que chama o proxy estiver em 'https://meu-proxy-filmes.onrender.com'
        // E a requisição para o stream proxy for feita a partir de uma página desse site,
        // o 'referer' será algo como 'https://meu-proxy-filmes.onrender.com/alguma-pagina'.
        // Precisamos enviar um Referer que o 'cnxfast.site' aceite.

        // A forma mais simples e que costuma funcionar para contornar bloqueios de hotlinking
        // é enviar um Referer genérico ou um que o servidor original espera ver.
        // Como o seu teste local funcionou, o Referer local era aceito.
        // Se o servidor original aceita um Referer genérico, vamos usá-lo.
        // Vamos tentar **remover** o Referer para o ambiente de produção (Render).
        // Para o teste local, podemos manter o Referer para que ele continue funcionando.
        // No entanto, o código que você mostrou antes, com 'req.headers['referer'] || originalStreamUrl',
        // é uma boa tentativa. O problema pode ser que o 'referer' *recebido* para o Render é o que está causando o bloqueio.

        // Vamos tentar o seguinte: encaminhar o Referer APENAS se ele vier de um domínio "seguro" ou ser genérico.
        // Se o referer for do seu próprio proxy (render.com ou localhost), é melhor removê-lo.
        // Isso é um pouco complicado de detectar programaticamente sem saber o domínio exato.

        // Uma solução mais direta para o problema do 403 no Render:
        // Enviar um Referer que o cnxfast.site provavelmente aceita.
        // O seu teste local funcionou com o Referer local. Isso sugere que o servidor de origem
        // não se importa tanto com o Referer *exato*, mas sim que ele exista e não seja bloqueado.

        // Tente esta configuração: Copia o User-Agent, e para o Referer, use um genérico.
        // Isso pode fazer com que seu site funcione no Render, e o seu teste local continue funcionando.
        // 'Referer': 'https://www.google.com/', // Um referer genérico
        // Ou se o seu teste local funcionou com o Referer que ele recebeu, tente reenviá-lo
        // mas remova-o se for do próprio domínio do render.
        
        // A MAIS PROVÁVEL SOLUÇÃO PARA AMBIENTES DIFERENTES:
        // Defina um 'Referer' que o servidor original provavelmente aceita.
        // Como o teste local funcionou, o problema é o Referer do Render.
        // Vamos tentar definir um Referer genérico para a requisição para o cnxfast.site.
        'Referer': 'https://example.com', // Ou um URL que você sabe que funciona, ou tente null
        
        // Se o acima falhar no Render, tente REMOVER o Referer completamente:
        // Se você comentar a linha acima, descomente esta:
        // 'Referer': null, 

        // Outros cabeçalhos que podem ser úteis (se necessário)
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
            if (!res.headersSent) {
                res.status(500).send('Erro ao transmitir o stream.');
            }
        });

    } catch (error) {
        console.error(`[PROXY ERROR] Erro ao buscar o stream original ${originalStreamUrl}:`, error.message);
        if (error.response) {
            console.error(`[PROXY ERROR] Status da Resposta: ${error.response.status}`);
            try {
                console.error(`[PROXY ERROR] Dados da Resposta:`, error.response.data);
            } catch (e) {
                console.error(`[PROXY ERROR] Não foi possível ler os dados da resposta.`);
            }
        }
        if (!res.headersSent) {
            res.status(error.response ? error.response.status : 500).send('Erro ao conectar ao stream original.');
        }
    }
});

app.listen(PORT, () => {
    console.log(`Servidor Proxy a correr em http://localhost:${PORT}`);
    console.log(`Pode testar o proxy em: http://localhost:${PORT}/stream-proxy?url=http://exemplo.com/seu-video.mp4`);
});