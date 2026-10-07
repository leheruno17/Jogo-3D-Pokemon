# Pokémon Chibi Adventure

Jogo 3D de coleta com Pikachu Chibi para uma atividade prática do SENAI-SP. HTML, CSS, JavaScript e Three.js r160, importado como ES Module local. Sem CDN, fontes remotas ou bibliotecas adicionais.

## Executar

1. Abra esta pasta no VS Code.
2. Instale ou habilite a extensão **Live Server**.
3. Clique com o botão direito em `index.html` e escolha **Open with Live Server**.
4. Clique em **Iniciar Jogo** para começar a partida e liberar o áudio.

Use um navegador atualizado com WebGL habilitado. Mantenha `vendor/three.module.js` e `Musica.mp3` nos caminhos indicados; o nome da música diferencia maiúsculas de minúsculas em alguns sistemas.

## Arquivos

- `index.html`: menu, HUD, telas, controles de toque e áudio local.
- `style.css`: interface responsiva e overlays.
- `script.js`: modelos de primitivas, PRNG, fases, movimento, colisões, animação e áudio sintetizado.
- `vendor/three.module.js`: Three.js r160 oficial, autocontido.
- `vendor/LICENSE`: licença MIT do Three.js.
- `Musica.mp3`: música preexistente usada em loop.

## Jogar

- **WASD / Setas:** movimentar no plano X/Z.
- **P / Esc:** pausar ou continuar.
- **M / botão de som:** silenciar ou ativar o áudio.
- Em dispositivos de toque, use o controle direcional na tela.
- **Pokébolas:** colete todas antes do prazo para avançar automaticamente.
- **Bala azul (Doce Raro):** acrescenta 10 segundos.
- **Raio dourado (Agilidade):** aumenta a velocidade em 50% por 5 segundos. Outra coleta renova a duração.
- **Obstáculos:** bloqueiam o caminho; Pikachu desliza ao redor ao encostar.
- **Voltorbs:** patrulham a partir da fase 4. Contato causa impulso e perda de 3 segundos, com 1,3 segundo de proteção contra dano repetido.

O jogo pausa ao perder foco. Pausas e transições não entram no tempo total; tentativas malsucedidas entram. Reiniciar a fase preserva sua seed e seu layout. Jogar novamente começa na fase 1 e zera o tempo total.

## Progressão

| Fase | Bioma | Seed | Pokébolas | Obstáculos | Voltorbs | Tempo inicial |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Rota Inicial | 12345 | 8 | 12 | 0 | 90 s |
| 2 | Floresta | 24690 | 10 | 18 | 0 | 80 s |
| 3 | Caverna | 37035 | 12 | 24 | 0 | 70 s |
| 4 | Vulcão | 49380 | 14 | 28 | 2 | 60 s |
| 5 | Liga Pokémon | 61725 | 16 | 34 | 2 | 50 s |

Cada fase também contém dois Doces Raros e dois raios. O PRNG Mulberry32 usa `seed = (índice da fase + 1) * 12345`. Amostragem com rejeição reserva o spawn, separa obstáculos por corredores e mantém itens fora dos círculos das patrulhas. Na Liga, oito pilares são gerados na faixa externa da arena. O piso metálico usa iluminação PBR e baixa rugosidade para destacar o brilho.

## Organização do código

`createPikachu`, `createBall`, `createPowerup` e `createObstacle` constroem os modelos. `generateLayout` gera posições pela seed, enquanto `buildPhase` cria a cena e limpa os recursos da fase anterior. `movePlayer` resolve movimento e colisões radiais; `animatePlayer` aplica `Math.sin` apenas durante a caminhada. `update` controla o tempo, as coletas e as mudanças de estado. `tone` e `sfx` produzem sons via Web Audio API.

Validações automatizadas executadas: determinismo e espaçamento das cinco seeds, contagens de entidades, construção das geometrias, coletas, duração de power-up, movimento, colisões, penalidade dos Voltorbs, derrota e avanço/vitória. A disponibilidade da música depende do arquivo local e da saída de áudio do navegador.
