// server.js

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.env || 3000; // Use process.env.PORT para deploy, fallback para 3000

// --- Configurações ---
// ATENÇÃO: SUBSTITUA 'SUA_CHAVE_AQUI' PELA SUA CHAVE REAL DO TMDb!
const TMDB_API_KEY = "4ca866a3a913e636f9bf67d4cc7538c6"; 
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const YOUTUBE_EMBED_URL = "https://www.youtube.com/embed/";

// Limite padrão de filmes para retornar por destaque ou busca
const DEFAULT_MAX_FILMES_RETORNADOS = 20; 

// Armazenamento em memória: Map para acesso rápido por ID
// Cada filme começa com info básica e é enriquecido com detalhes do TMDb sob demanda
let FILMES_CATALOGO = new Map(); // Map<ID, FilmeObjeto>

// Variável para armazenar o mapeamento de IDs de gênero para nomes do TMDb (ainda usada para enriquecimento)
let TMDB_GENRES_MAP = new Map(); // Map<ID_Genero, Nome_Genero>

// --- Middleware para servir arquivos estáticos (HTML, CSS, JS do front-end) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Funções Auxiliares para Processamento e TMDb ---

/**
 * Embaralha um array aleatoriamente.
 * @param {Array} array O array a ser embaralhado.
 * @returns {Array} O array embaralhado.
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Troca elementos
    }
    return array;
}

/**
 * Busca e carrega o mapeamento completo de IDs de gênero para nomes do TMDb.
 * Essencial para converter IDs de gênero do TMDb em nomes quando enriquecendo filmes.
 */
async function carregarMapeamentoGenerosTMDb() {
    console.log("A carregar o mapeamento de géneros do TMDb...");
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/genre/movie/list`, {
            params: {
                api_key: TMDB_API_KEY,
                language: "pt-BR"
            }
        });
        response.data.genres.forEach(genre => {
            TMDB_GENRES_MAP.set(genre.id, genre.name);
        });
        console.log(`Mapeamento de géneros do TMDb carregado. Total de géneros: ${TMDB_GENRES_MAP.size}`);
    } catch (error) {
        console.error("Erro ao carregar o mapeamento de géneros do TMDb:", error.message);
        // Em caso de erro, definimos um mapeamento de fallback (menos abrangente)
        TMDB_GENRES_MAP = new Map([
            [28, "Ação"], [12, "Aventura"], [16, "Animação"], [35, "Comédia"], [80, "Crime"],
            [18, "Drama"], [27, "Terror"], [878, "Ficção Científica"], [53, "Thriller"]
        ]);
        console.warn("A usar o mapeamento de géneros de fallback devido a erro na API TMDb.");
    }
}


/**
 * Busca detalhes de um filme no TMDb pelo título e preenche o objeto do filme.
 * Marca o filme como 'tmdb_processed' após a tentativa de busca, sucesso ou falha.
 * @param {Object} filme O objeto filme com pelo menos 'titulo'.
 * @returns {Object} O objeto filme enriquecido com detalhes do TMDb.
 */
async function getFilmeDetalhesComTMDb(filme) {
    // Se o filme já foi processado pelo TMDb, retorna o que já temos.
    if (filme.tmdb_processed) { 
        return filme;
    }

    try {
        // Tenta remover sufixos comuns antes de buscar no TMDb para melhor precisão
        let tituloParaBusca = filme.titulo.replace(/ \[L\]| \[D\]| \[HD\]| \[FHD\]| \[SD\]| \[4K\]| \[H265\]/gi, '').trim();
        // Remove também ano entre parênteses para busca mais limpa
        tituloParaBusca = tituloParaBusca.replace(/\(\d{4}\)/, '').trim();
        
        const response = await axios.get(`${TMDB_BASE_URL}/search/movie`, {
            params: {
                api_key: TMDB_API_KEY,
                query: tituloParaBusca,
                language: "pt-BR"
            }
        });

        const filmesTMDb = response.data.results;
        if (filmesTMDb && filmesTMDb.length > 0) {
            const filmeTMDbDetalhes = filmesTMDb[0]; // Pega o primeiro resultado como o mais relevante

            filme.sinopse = filmeTMDbDetalhes.overview || "Sinopse não disponível.";
            if (filmeTMDbDetalhes.poster_path) {
                filme.poster_url = `${TMDB_IMAGE_BASE_URL}${filmeTMDbDetalhes.poster_path}`;
            }
            if (filmeTMDbDetalhes.release_date) {
                filme.ano = filmeTMDbDetalhes.release_date.split('-')[0];
            }
            if (filmeTMDbDetalhes.vote_average) {
                filme.nota = filmeTMDbDetalhes.vote_average.toFixed(1);
            }
            if (filmeTMDbDetalhes.genre_ids && filmeTMDbDetalhes.genre_ids.length > 0) {
                filme.generos = filmeTMDbDetalhes.genre_ids
                    .map(id => TMDB_GENRES_MAP.get(id))
                    .filter(g => g !== undefined && g !== null); 
                if (filme.generos.length === 0) {
                   filme.generos = filme._original_m3u_genres || ["Não Categorizado"];
                }
            } else {
                filme.generos = filme._original_m3u_genres || ["Não Categorizado"];
            }
            filme.trailer_url = await buscarTrailerNoTMDb(filmeTMDbDetalhes.id);
        } else {
            filme.generos = filme._original_m3u_genres || ["Não Categorizado"];
        }
        filme.tmdb_processed = true; 
    } catch (error) {
        if (error.response && error.response.status !== 401) {
            console.error(`Erro ao buscar detalhes no TMDb para "${filme.titulo}":`, error.message);
        }
        filme.tmdb_processed = true; 
    }
    return filme;
}

async function buscarTrailerNoTMDb(filmeId) {
    if (!filmeId) return null;
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/movie/${filmeId}/videos`, {
            params: {
                api_key: TMDB_API_KEY,
                language: "pt-BR"
            }
        });
        const videos = response.data.results;
        const trailer = videos.find(video => video.site === "YouTube" && video.type === "Trailer");
        return trailer ? `${YOUTUBE_EMBED_URL}${trailer.key}` : null;
    } catch (error) {
        if (error.response && error.response.status !== 401) {
            console.error(`Erro ao buscar o trailer no TMDb para o ID ${filmeId}:`, error.message);
        }
        return null;
    }
}

/**
 * Carrega a lista M3U, extrai informações básicas e o group-title como género inicial (padronizado).
 */
async function carregarEProcessarListaM3U(caminhoArquivo) {
    console.log(`A iniciar o carregamento da lista M3U de: ${caminhoArquivo}`);
    let idCounter = 1;

    try {
        const conteudo = fs.readFileSync(caminhoArquivo, 'utf-8');
        const linhas = conteudo.split('\n');
        let filmeAtualBasico = null;

        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i].trim();

            if (linha.startsWith('#EXTINF:')) {
                const tvgNameMatch = linha.match(/tvg-name="([^"]+)"/);
                const groupTitleMatch = linha.match(/group-title="([^"]+)"/);

                let initialGenres = ["Não Categorizado"];
                if (groupTitleMatch && groupTitleMatch[1]) {
                    const fullGroupTitle = groupTitleMatch[1].trim();
                    const parts = fullGroupTitle.split('|').map(p => p.trim());
                    let extractedGenre = parts[parts.length - 1]; 
                    
                    if (parts.length > 1 && parts[0].toLowerCase() === "filmes") {
                        extractedGenre = parts[1];
                    }

                    if (extractedGenre && extractedGenre !== "Filmes" && extractedGenre !== "Series" && extractedGenre !== "Canais") {
                        let matchedTMDbGenreName = null;
                        for (const [id, name] of TMDB_GENRES_MAP.entries()) {
                            if (name.toLowerCase() === extractedGenre.toLowerCase()) {
                                matchedTMDbGenreName = name;
                                break;
                            }
                        }

                        if (matchedTMDbGenreName) {
                            initialGenres = [matchedTMDbGenreName];
                        } else {
                            initialGenres = [extractedGenre];
                        }
                    }
                }

                if (tvgNameMatch && tvgNameMatch[1]) {
                    filmeAtualBasico = {
                        id: idCounter++,
                        titulo: tvgNameMatch[1].trim(),
                        url_stream_original: null,
                        sinopse: "Sinopse não disponível.",
                        poster_url: "https://via.placeholder.com/150x225?text=Sem+Poster",
                        generos: initialGenres,
                        _original_m3u_genres: initialGenres,
                        ano: "N/A",
                        nota: "N/A",
                        trailer_url: null,
                        tmdb_processed: false 
                    };
                }
            } else if (linha.startsWith('http') && filmeAtualBasico) {
                filmeAtualBasico.url_stream_original = linha;
                FILMES_CATALOGO.set(filmeAtualBasico.id, filmeAtualBasico);
                filmeAtualBasico = null;
            }
        }
        console.log(`Processamento da lista M3U concluído. ${FILMES_CATALOGO.size} filmes/itens básicos carregados.`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Erro: Ficheiro '${caminhoArquivo}' não encontrado. Por favor, crie-o.`);
        } else {
            console.error(`Ocorreu um erro ao processar a lista M3U:`, error);
        }
        return new Map();
    }
}

// --- Rotas da API (REST Endpoints para o Front-end) ---

// Retorna os filmes em destaque (os primeiros X da lista com detalhes do TMDb)
// Esta rota mantém a funcionalidade original para 'destaques' não aleatórios,
// caso o frontend a chame diretamente.
app.get('/api/filmes', async (req, res) => {
    const filmesParaDestaque = Array.from(FILMES_CATALOGO.values()).slice(0, DEFAULT_MAX_FILMES_RETORNADOS);
    const filmesComDetalhes = await Promise.all(filmesParaDestaque.map(f => getFilmeDetalhesComTMDb(f)));
    res.json(filmesComDetalhes);
});

// Nova rota para retornar filmes aleatórios e detalhados
app.get('/api/filmes/random/:count', async (req, res) => {
    let count = parseInt(req.params.count);
    if (isNaN(count) || count <= 0) {
        count = DEFAULT_MAX_FILMES_RETORNADOS; // Fallback para o valor padrão se inválido
    }

    const todosFilmesBasicos = Array.from(FILMES_CATALOGO.values());
    // Embaralha a lista completa de filmes básicos
    const filmesEmbaralhados = shuffleArray([...todosFilmesBasicos]); // Cria uma cópia para embaralhar

    // Seleciona o número desejado de filmes embaralhados
    const filmesSelecionados = filmesEmbaralhados.slice(0, count);

    // Busca os detalhes TMDb para os filmes selecionados
    console.log(`A carregar detalhes para ${filmesSelecionados.length} filmes aleatórios...`);
    const filmesComDetalhes = await Promise.all(
        filmesSelecionados.map(f => getFilmeDetalhesComTMDb(f))
    );
    console.log(`Detalhes carregados para ${filmesComDetalhes.length} filmes aleatórios.`);
    res.json(filmesComDetalhes);
});


// Retorna os detalhes de um filme específico pelo ID
app.get('/api/filmes/:id', async (req, res) => {
    const filmeId = parseInt(req.params.id);
    let filme = FILMES_CATALOGO.get(filmeId);

    if (filme) {
        filme = await getFilmeDetalhesComTMDb(filme);
        res.json(filme);
    } else {
        res.status(404).json({ message: 'Filme não encontrado.' });
    }
});

// Rotas de Categoria REMOVIDAS
// app.get('/api/generos', ...);
// app.get('/api/filmes/genero/:generoNome', ...);

// Endpoint para busca de filmes
app.get('/api/busca', async (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    if (!query) {
        return res.json([]);
    }

    const filmesEncontrados = [];
    const filmesParaProcessar = [];

    // Itera sobre todos os filmes no catálogo básico
    for (const filmeBasico of FILMES_CATALOGO.values()) {
        // Se já atingimos o limite de filmes, podemos parar de buscar
        if (filmesEncontrados.length >= DEFAULT_MAX_FILMES_RETORNADOS) { // Usa o limite padrão aqui
            console.log(`[API Busca] Limite de ${DEFAULT_MAX_FILMES_RETORNADOS} filmes atingido. A parar a busca.`);
            break; 
        }

        // Verifica se o título do filme corresponde à query (case-insensitive)
        if (filmeBasico.titulo.toLowerCase().includes(query)) {
            // Se o filme corresponde, adiciona para processamento de detalhes
            filmesParaProcessar.push(filmeBasico);
        }
    }

    // Processa os filmes encontrados para obter seus detalhes do TMDb
    const resultadosComDetalhes = await Promise.all(
        filmesParaProcessar.map(f => getFilmeDetalhesComTMDb(f))
    );

    // Filtra e adiciona apenas os filmes que realmente têm os detalhes e correspondem
    resultadosComDetalhes.forEach(filme => {
        // Garante que o objeto no FILMES_CATALOGO global esteja atualizado
        FILMES_CATALOGO.set(filme.id, filme); 
        filmesEncontrados.push(filme);
    });

    // Garante que a lista final não exceda o DEFAULT_MAX_FILMES_RETORNADOS
    const filmesFinais = filmesEncontrados.slice(0, DEFAULT_MAX_FILMES_RETORNADOS);

    console.log(`[API Busca] Total final de filmes encontrados para '${query}': ${filmesFinais.length}`);
    res.json(filmesFinais);
});

// --- Inicialização do Servidor ---

async function inicializarServidor() {
    const CAMINHO_LISTA_IPTV = path.join(__dirname, "filmes.m3u");

    if (TMDB_API_KEY === "4ca866a3a913e636f9bf67d4cc7538c6") {
        console.warn("\nATENÇÃO: Por favor, substitua 'SUA_CHAVE_AQUI' pela sua chave REAL do TMDb em server.js!\n");
    }

    await carregarMapeamentoGenerosTMDb();
    await carregarEProcessarListaM3U(CAMINHO_LISTA_IPTV);

    app.listen(PORT, () => {
        console.log(`Servidor a correr em http://localhost:${PORT}`);
        console.log(`Aceda à página principal em: http://localhost:${PORT}/index.html`);
    });
}

inicializarServidor();
