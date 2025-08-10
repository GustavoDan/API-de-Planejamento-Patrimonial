# Backend - Ferramenta de Planejamento Financeiro

Este repositório contém o backend da aplicação, desenvolvido com Node.js, Fastify e Prisma.

## Arquitetura e Decisões Técnicas

A arquitetura do backend foi projetada com base nos seguintes princípios:

- **Model-First com Prisma:** O schema do banco de dados, definido em `prisma/schema.prisma`, é a fonte única da verdade para a estrutura de dados. Ele foi projetado primeiro para garantir consistência e gerar tipos seguros para toda a aplicação.
- **Separação de Convenções:** Adotei o uso de `@@map` e `@map` no schema do Prisma. Isso permite usar a convenção `PascalCase/camelCase` no código TypeScript, que são idiomáticas para o ambiente, enquanto mantenho a convenção `snake_case` no banco de dados PostgreSQL, que é o padrão da comunidade SQL.
- **Estrutura Relacional:** O banco de dados foi modelado de forma relacional para garantir a integridade dos dados. As principais relações são:
  - Um `Client` pode ter múltiplos `Goals`, `Events`, `Simulations` e `Insurances` (Relação 1-N).
  - Um `Client` possui uma única `Wallet` (Relação 1-1).
  - Um `User` está associado a um `Client`, permitindo que o próprio cliente (role `viewer`) acesse seus dados.
- **Separação de Autenticação e Dados de Domínio:** Foi criada uma distinção clara entre o modelo `User` (responsável por autenticação, senhas e papéis) e o modelo `Client` (responsável pelos dados de negócio do cliente). Isso melhora a segurança e a clareza do sistema.
- **Gerenciamento de Dados Estruturados (JSON):** Para campos que representam objetos complexos como `familyProfile` (perfil familiar), `assetClasses` (classes de ativos) e `projection` (dados da simulação), optei por usar o tipo `Json` do Prisma (mapeado para `jsonb` no PostgreSQL). Para garantir a integridade e o formato desses objetos, a validação não é delegada ao banco, mas sim garantida na camada da aplicação através de schemas **Zod**. Esta abordagem oferece um bom equilíbrio entre a flexibilidade de um schema dinâmico e a segurança de dados consistentes e tipados no código, evitando a complexidade de criar tabelas adicionais para cada um desses casos de uso. As estruturas esperadas são:
  - **`assetClasses`**: Um array de objetos, onde cada objeto representa uma classe de ativo. Ex:
    ```json
    [
      { "className": "Ações Nacionais", "percentage": 50.0 },
      { "className": "Renda Fixa", "percentage": 50.0 }
    ]
    ```
  - **`familyProfile`**: Um array de objetos, onde cada objeto representa um membro da família. Ex:
    ```json
    [
      {
        "relationship": "PARTNER",
        "name": "Maria Silva",
        "dateOfBirth": "1990-05-20T00:00:00.000Z"
      },
      {
        "relationship": "CHILD",
        "name": "Pedro Silva",
        "dateOfBirth": "2015-10-10T00:00:00.000Z"
      }
    ]
    ```
  - **`projection`**: Um array de objetos representando a projeção patrimonial anual. Ex:
    ```json
    [
      { "year": 2024, "projectedValue": 110000 },
      { "year": 2025, "projectedValue": 121500 }
    ]
    ```
- **Manuseio de Valores Monetários:** Para garantir a precisão absoluta em todos os cálculos financeiros e evitar erros de arredondamento inerentes aos tipos de ponto flutuante (`Float`), todos os campos que representam dinheiro (`targetValue`, `totalValue`, etc.) foram implementados usando o tipo `Decimal` do Prisma. Este tipo é mapeado para o tipo `NUMERIC` de precisão exata no PostgreSQL, que é o padrão da indústria para aplicações financeiras.
- **Identificadores de Entidade (UUID):** Para as chaves primárias de todas as tabelas principais, optei por usar UUIDs (Universally Unique Identifiers) em vez de inteiros autoincrementais. Esta abordagem aumenta a segurança ao não expor a contagem de registros, facilita a integração com sistemas distribuídos e previne conflitos de ID em cenários de importação de dados ou replicação. Os UUIDs são gerados pela aplicação no momento da criação do registro.
- **Otimização de Performance com Índices:** Para garantir consultas rápidas e uma experiência de usuário fluida, mesmo com um grande volume de dados, implementei índices estratégicos no banco de dados. A maioria das consultas na aplicação são filtradas por cliente e ordenadas por data. Portanto, criei **índices compostos** (ex: `(client_id, created_at)`) nas tabelas `Events`, `Goals`, `Simulations` e `Insurances`. Esses índices permitem que o banco de dados localize e ordene os registros de um cliente específico de forma extremamente eficiente, evitando "full table scans" e melhorando drasticamente a performance das leituras.
- **Autenticação Stateless com JWT:** O sistema utiliza JSON Web Tokens (JWT) para autenticação, seguindo uma abordagem _stateless_. Após o login, o cliente recebe um token assinado que contém o ID (`sub`) e o papel (`role`) do usuário. Este token é enviado no cabeçalho `Authorization` de cada requisição subsequente. O servidor valida o token sem precisar consultar o banco de dados para cada requisição, o que melhora a performance e a escalabilidade. O logout é gerenciado pelo cliente, que simplesmente descarta o token.
- **Modelo de Permissões Explícitas e Hooks de Autorização:** A segurança da API é garantida por um modelo de permissões explícito, implementado através de hooks reutilizáveis do Fastify. A autenticação (`authenticate`) e a autorização de papéis (`ensureAdvisor`) são desacopladas da lógica de negócio das rotas. Isso torna o código das rotas mais limpo, simplifica os testes e centraliza as regras de segurança, seguindo o princípio DRY (Don't Repeat Yourself). Rotas administrativas (`/users/:clientId`) e de perfil pessoal (`/me`) são intencionalmente separadas para maior clareza e segurança.
- **Controle de Acesso Granular (Baseado em Propriedade):** Para além da simples verificação de papéis (`role`), a API implementa um controle de acesso baseado na propriedade dos dados. Isso é evidente nas rotas de leitura de Metas (`Goals`), onde um `VIEWER` tem permissão para acessar apenas os recursos que estão associados ao seu `clientId`. Esta lógica é garantida tanto por hooks reutilizáveis (`ensureOwnerOrAdvisor`) quanto por verificações explícitas dentro das rotas, assegurando a privacidade e a segurança dos dados de cada cliente.
- **Serialização de Tipos Decimais para `string`:** Para prevenir a perda de precisão que pode ocorrer ao serializar tipos de dados `Decimal` (usados para valores monetários), todos os valores decimais são convertidos para `string` antes de serem enviados nas respostas da API. Isso garante que o frontend receba o valor exato, sem erros de arredondamento de ponto flutuante, sendo responsabilidade do cliente da API fazer o parse para um formato numérico seguro.
- **Design da API para Recursos 1-para-1 (Upsert Pattern):** Para recursos que têm uma relação estrita de um-para-um com seu pai, como a `Wallet` de um `Client`, adotei o padrão de "Upsert" em vez de um CRUD tradicional. Não existe uma rota `POST` separada para criação. Em vez disso, uma única rota `PUT /clients/:clientId/wallet` é responsável por criar a carteira ou atualizá-la, retornando sempre `200 OK`. Esta abordagem cria uma interface de API mais simples e idempotente para o gerenciamento de recursos singulares.
- **Separação da Lógica de Negócio em Serviços:** Para funcionalidades complexas como o cálculo de alinhamento e a projeção patrimonial, a lógica de negócio foi abstraída em "Serviços" (`.service.ts`). As rotas da API atuam como uma camada fina, responsável apenas por lidar com a requisição/resposta e chamar o serviço correspondente. Isso torna a lógica de negócio principal independente do framework web, altamente testável com testes unitários, e mais fácil de manter.

## Suposições e Esclarecimentos

Durante o desenvolvimento, algumas decisões foram tomadas com base em interpretações dos requisitos, uma vez que o case não especificava todos os detalhes. As principais suposições foram:

- **Correção da Fórmula de Alinhamento:** A especificação do case sugeria a fórmula `(patrimônio no plano / patrimônio atual)` para o cálculo de alinhamento. Após análise da lógica de negócio, identifiquei que esta fórmula leva a resultados contra-intuitivos (ex: um patrimônio baixo resultaria em um percentual de alinhamento altíssimo). Para refletir corretamente o progresso em direção às metas, implementei a fórmula: **`(patrimônio atual / patrimônio no plano) * 100`**. Esta correção garante que a categorização de cores (`verde`, `vermelho`, etc.) represente de forma precisa e intuitiva o quão próximo o cliente está de atingir seus objetivos financeiros.
- **Definição de "Patrimônio no Plano":** O case não especificava como o "patrimônio no plano" deveria ser calculado. Assumi que ele representa a **soma dos valores-alvo (`targetValue`) de todas as metas (`Goal`)** cadastradas para o cliente. Esta abordagem oferece uma visão holística do plano financeiro total do cliente.
- **Tratamento de Casos de Borda no Cálculo de Alinhamento:** A lógica de cálculo foi projetada para ser robusta. Se um cliente não possui metas cadastradas ou se o valor total do plano for zero, o alinhamento é tratado de forma a evitar erros (como divisão por zero) e retornar um resultado lógico (ex: 100% de alinhamento se o cliente já possui patrimônio, mas não tem metas definidas). Da mesma forma, se o cliente não possui uma carteira, o cálculo não é possível e um erro claro é retornado.
- **Criação do Modelo `Insurance`:** A seção `Entregáveis` não menciona essa tabela na migração inicial, porém, a funcionalidade `Perfis de Seguro` exige um local para armazenar os dados de cada seguro. Para isso, foi criado o modelo `Insurance`, que se relaciona com um `Client`.
- **Criação do Modelo `User`:** Para implementar a autenticação JWT com papéis (`advisor`, `viewer`) de forma segura e escalável, foi criado um modelo `User`. Este modelo armazena as credenciais de login e o papel do usuário, sendo distinto do modelo `Client`, que armazena os dados pessoais e financeiros.
- **Armazenamento de Idade vs. Data de Nascimento:** O case pedia para armazenar a "idade" do cliente. No entanto, armazenar uma idade como um número estático é uma má prática, pois o dado se torna obsoleto anualmente. Para garantir a precisão e a integridade dos dados ao longo do tempo, foi tomada a decisão de armazenar o campo `dateOfBirth` (data de nascimento). A idade é então calculada dinamicamente no backend sempre que necessário, garantindo que a informação seja sempre atual e precisa.
- **Estrutura do Modelo de Eventos (`Event`):** Para aumentar a robustez e a clareza, o campo que descreve o tipo de um evento foi dividido em duas partes: um campo `category` (um Enum que define o impacto financeiro: `INCOME` ou `EXPENSE`) e um campo `description` (um String para o contexto do usuário). Esta separação permite que o motor de projeção opere de forma segura com base na categoria, enquanto o usuário mantém a flexibilidade de descrever o evento detalhadamente.
- **Validação de Valores Monetários (Zero vs. Positivo):** Foi feita uma distinção deliberada na validação dos valores monetários para diferentes entidades, baseada em seus propósitos de negócio:
- **Patrimônio (`Wallet.totalValue`):** Permite valores iguais ou maiores que 0. Isso representa a realidade de um cliente que pode ter um patrimônio zerado, garantindo que o cálculo de alinhamento lide com este caso de borda sem erros.
- **Outras Entidades (`Goal`, `Event`, `Insurance`):** Exigem valores estritamente positivos (`> 0`). A lógica de negócio assume que uma meta, uma movimentação ou uma apólice de seguro com valor zero não possui significado prático para os cálculos de planejamento e, portanto, não são permitidas na criação dos registros.
- **Lógica do Motor de Projeção Patrimonial:** O motor de simulação (`simulateWealthCurve`) foi construído com base nas seguintes premissas de negócio para garantir consistência e previsibilidade:
  - **Juros Compostos Mensais:** A taxa de juros anual fornecida é convertida para uma taxa mensal efetiva, que é aplicada mensalmente sobre o saldo total.
  - **Ordem de Operações:** Dentro de cada mês, a ordem dos cálculos é: (1) aplicação de eventos anuais (se for Janeiro), (2) aplicação de eventos mensais, (3) aplicação dos juros compostos sobre o novo saldo.
  - **Timing dos Eventos:** Eventos `UNIQUE` são aplicados uma única vez no início da simulação. Eventos `ANNUAL` são aplicados sempre no início de Janeiro de cada ano. Eventos `MONTHLY` são aplicados no início de cada mês.
  - **Tratamento de Dívida:** A simulação permite que o patrimônio projetado se torne negativo caso as despesas superem os ativos. Os juros compostos são aplicados normalmente sobre o saldo negativo, simulando o custo de uma dívida.

## Endpoints da API

A documentação interativa completa da API está disponível via Swagger na rota `/docs` quando a aplicação está em execução. Abaixo está um resumo dos principais endpoints implementados.

---

### Sessões (`/sessions`)

Endpoints responsáveis pela autenticação e gerenciamento de sessões.

- **`POST /sessions`**
  - **Descrição:** Autentica um usuário e retorna um token JWT.
  - **Corpo da Requisição:** `{ "email": "string", "password": "string" }`
  - **Respostas:**
    - `200 OK`: `{ "token": "string" }` - Autenticação bem-sucedida.
    - `401 Unauthorized`: `{ "message": "string" }` - Credenciais inválidas.
  - **Acesso:** Público.

---

### Usuários (`/users` e `/me`)

Endpoints para o gerenciamento de contas de usuário e perfil pessoal.

- **`POST /users`**

  - **Descrição:** Cria um novo usuário (`ADVISOR` ou `VIEWER`).
  - **Corpo da Requisição:** `{ "email": "string", "password": "string", "role": "ADVISOR" | "VIEWER", "clientId?": "string" }`
  - **Respostas:**
    - `201 Created`: Objeto do usuário criado (sem a senha).
    - `409 Conflict`: `{ "message": "string" }` - E-mail já está em uso.
    - `404 Not Found`: `{ "message": "string" }` - `clientId` fornecido não existe.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /users`**

  - **Descrição:** Lista todos os usuários do sistema com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "users": [...], "meta": { ... } }`.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /users/:userId`**

  - **Descrição:** Retorna os dados de um usuário específico.
  - **Respostas:**
    - `200 OK`: Objeto do usuário (sem a senha).
    - `404 Not Found`: `{ "message": "string" }` - Usuário não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /me`**

  - **Descrição:** Retorna os dados do usuário atualmente autenticado.
  - **Respostas:**
    - `200 OK`: Objeto do usuário (sem a senha).
    - `404 Not Found`: O usuário associado ao token não existe mais no banco.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** Qualquer usuário autenticado.

- **`PUT /users/:userId`**

  - **Descrição:** Atualiza os dados de um usuário específico.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados.
  - **Respostas:**
    - `200 OK`: Objeto do usuário atualizado.
    - `409 Conflict`: `{ "message": "string" }` - O e-mail fornecido já está em uso por outro usuário.
    - `404 Not Found`: `{ "message": "string" }` - Usuário não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`DELETE /users/:userId`**
  - **Descrição:** Deleta um usuário específico.
  - **Respostas:**
    - `204 No Content`: Usuário deletado com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Usuário não encontrado.
    - `400 Bad Request`: `{ "message": "string" }` - Tentativa de auto-deleção.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

---

### Clientes (`/clients`)

Endpoints para o gerenciamento de dados de clientes. O acesso a todas estas rotas é restrito a usuários com o papel `ADVISOR`.

- **`POST /clients`**

  - **Descrição:** Cria um novo cliente no sistema.
  - **Corpo da Requisição:** `{ "name": "string", "email": "string", "dateOfBirth": "string (ISO 8601)", "isActive?": "boolean", "familyProfile?": [...] }`
  - **Respostas:**
    - `201 Created`: Objeto do cliente recém-criado.
    - `409 Conflict`: `{ "message": "string" }` - Um cliente com o e-mail fornecido já existe.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`GET /clients`**

  - **Descrição:** Lista todos os clientes com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "clients": [...], "meta": { ... } }`.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`GET /clients/:clientId`**

  - **Descrição:** Retorna os detalhes de um cliente específico.
  - **Respostas:**
    - `200 OK`: Objeto do cliente.
    - `404 Not Found`: `{ "message": "string" }` - Cliente não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`PUT /clients/:clientId`**

  - **Descrição:** Atualiza os dados de um cliente específico.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados.
  - **Respostas:**
    - `200 OK`: Objeto do cliente atualizado.
    - `404 Not Found`: `{ "message": "string" }` - Cliente não encontrado.
    - `409 Conflict`: `{ "message": "string" }` - O e-mail fornecido já está em uso por outro cliente.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

- **`DELETE /clients/:clientId`**
  - **Descrição:** Deleta um cliente específico.
  - **Respostas:**
    - `204 No Content`: Cliente deletado com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Cliente não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.

---

### Planejamento e Alinhamento (`/clients/:clientId/alignment`)

Endpoint de análise que calcula e retorna o alinhamento de um cliente ao seu plano financeiro.

- **`GET /clients/:clientId/alignment`**
  - **Descrição:** Calcula o percentual de alinhamento de um cliente, comparando seu patrimônio atual com o patrimônio total planejado em suas metas.
  - **Respostas:**
    - `200 OK`: `{ "alignmentPercentage": number, "category": "green" | "yellow-light" | "yellow-dark" | "red" }`
    - `400 Bad Request`: `{ "message": "string" }` - O cálculo não pôde ser realizado por falta de dados (ex: cliente sem carteira ou sem metas cadastradas).
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono do cliente.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do cliente.

---

### Simulações e Projeções (`/clients/:clientId/projections`)

Endpoints para gerar projeções de evolução patrimonial e, futuramente, gerenciar simulações salvas.

- **`POST /clients/:clientId/projections`**
  - **Descrição:** Gera uma projeção patrimonial ano a ano até 2060 para um cliente, com base em seu patrimônio atual, movimentações futuras e uma taxa de juros real.
  - **Corpo da Requisição:** `{ "annualRate?": number }` (taxa em percentual, ex: `4` para 4%. Padrão é 4% se não fornecido).
  - **Respostas:**
    - `200 OK`: `[ { "year": number, "projectedValue": "string" } ]` - Um array com a projeção anual.
    - `400 Bad Request`: `{ "message": "string" }` - A projeção não pôde ser realizada (ex: cliente sem carteira cadastrada).
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono do cliente.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do cliente.

---

### Metas (`/goals`)

Endpoints para o gerenciamento das metas financeiras dos clientes. As rotas de criação e modificação são restritas a `ADVISORs`, enquanto as rotas de leitura permitem que `VIEWERs` acessem seus próprios dados.

- **`POST /clients/:clientId/goals`**

  - **Descrição:** Cria uma nova meta para um cliente específico.
  - **Corpo da Requisição:** `{ "description": "string", "targetValue": number, "targetDate": "string (ISO 8601)" }`
  - **Respostas:**
    - `201 Created`: Objeto da meta criada (com `targetValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Cliente com o `clientId` especificado não foi encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /clients/:clientId/goals`**

  - **Descrição:** Lista todas as metas de um cliente específico com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "goals": [...], "meta": { ... } }` (com `targetValue` como `string`).
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono dos dados.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do cliente.

- **`GET /goals/:goalId`**

  - **Descrição:** Retorna os detalhes de uma meta específica.
  - **Respostas:**
    - `200 OK`: Objeto da meta (com `targetValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Meta com o ID especificado não foi encontrada.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono da meta.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono da meta.

- **`PUT /goals/:goalId`**

  - **Descrição:** Atualiza os dados de uma meta específica.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados (todos opcionais).
  - **Respostas:**
    - `200 OK`: Objeto da meta atualizada (com `targetValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Meta não encontrada.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`DELETE /goals/:goalId`**
  - **Descrição:** Deleta uma meta específica.
  - **Respostas:**
    - `204 No Content`: Meta deletada com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Meta não encontrada.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

---

### Carteira (`/clients/:clientId/wallet`)

Endpoints para o gerenciamento da carteira de um cliente (patrimônio e alocação de ativos). Como cada cliente possui apenas uma carteira, a API utiliza um padrão de "upsert" na rota `PUT`.

- **`GET /clients/:clientId/wallet`**

  - **Descrição:** Obtém a carteira de um cliente específico.
  - **Respostas:**
    - `200 OK`: Objeto da carteira (com `totalValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Nenhuma carteira foi criada para este cliente ainda.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono do cliente.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do cliente.

- **`PUT /clients/:clientId/wallet`**

  - **Descrição:** Cria (na primeira chamada) ou atualiza (nas chamadas subsequentes) a carteira de um cliente.
  - **Corpo da Requisição:** `{ "totalValue": number, "assetClasses?": [...] }`
  - **Respostas:**
    - `200 OK`: Objeto da carteira criada/atualizada (com `totalValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - O cliente com o `clientId` especificado não foi encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`DELETE /clients/:clientId/wallet`**
  - **Descrição:** Deleta a carteira de um cliente específico.
  - **Respostas:**
    - `204 No Content`: Carteira deletada com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Nenhuma carteira existe para este cliente.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

---

### Movimentações / Eventos (`/events`)

Endpoints para o gerenciamento de movimentações financeiras (eventos) que afetam a projeção patrimonial de um cliente.

- **`POST /clients/:clientId/events`**

  - **Descrição:** Cria uma nova movimentação para um cliente específico.
  - **Corpo da Requisição:** `{ "description": "string", "category": "INCOME" | "EXPENSE", "value": number, "frequency": "UNIQUE" | "MONTHLY" | "ANNUAL" }`
  - **Respostas:**
    - `201 Created`: Objeto da movimentação criada (com `value` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Cliente com o `clientId` especificado não foi encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /clients/:clientId/events`**

  - **Descrição:** Lista todas as movimentações de um cliente específico com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "events": [...], "meta": { ... } }` (com `value` como `string`).
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono dos dados.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do cliente.

- **`GET /events/:eventId`**

  - **Descrição:** Retorna os detalhes de uma movimentação específica.
  - **Respostas:**
    - `200 OK`: Objeto da movimentação (com `value` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Movimentação com o ID especificado não foi encontrada.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono da movimentação.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono da movimentação.

- **`PUT /events/:eventId`**

  - **Descrição:** Atualiza os dados de uma movimentação específica.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados (todos opcionais).
  - **Respostas:**
    - `200 OK`: Objeto da movimentação atualizada (com `value` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Movimentação não encontrada.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`DELETE /events/:eventId`**
  - **Descrição:** Deleta uma movimentação específica.
  - **Respostas:**
    - `204 No Content`: Movimentação deletada com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Movimentação não encontrada.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

---

### Seguros (`/insurances`)

Endpoints para o gerenciamento dos seguros de um cliente.

- **`POST /clients/:clientId/insurances`**

  - **Descrição:** Cria um novo seguro para um cliente específico.
  - **Corpo da Requisição:** `{ "type": "LIFE" | "DISABILITY", "coverageValue": number }`
  - **Respostas:**
    - `201 Created`: Objeto do seguro criado (com `coverageValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Cliente com o `clientId` especificado não foi encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`GET /clients/:clientId/insurances`**

  - **Descrição:** Lista todos os seguros de um cliente específico com paginação.
  - **Query Params:** `?page=number&pageSize=number`
  - **Respostas:**
    - `200 OK`: Objeto paginado `{ "insurances": [...], "meta": { ... } }` (com `coverageValue` como `string`).
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono dos dados.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do cliente.

- **`GET /insurances/:insuranceId`**

  - **Descrição:** Retorna os detalhes de um seguro específico.
  - **Respostas:**
    - `200 OK`: Objeto do seguro (com `coverageValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Seguro com o ID especificado não foi encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR` nem o dono do seguro.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR` ou o `VIEWER` dono do seguro.

- **`PUT /insurances/:insuranceId`**

  - **Descrição:** Atualiza os dados de um seguro específico.
  - **Corpo da Requisição:** Objeto com os campos a serem atualizados (todos opcionais).
  - **Respostas:**
    - `200 OK`: Objeto do seguro atualizado (com `coverageValue` como `string`).
    - `404 Not Found`: `{ "message": "string" }` - Seguro não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

- **`DELETE /insurances/:insuranceId`**
  - **Descrição:** Deleta um seguro específico.
  - **Respostas:**
    - `204 No Content`: Seguro deletado com sucesso.
    - `404 Not Found`: `{ "message": "string" }` - Seguro não encontrado.
    - `403 Forbidden`: O usuário autenticado não é um `ADVISOR`.
    - `401 Unauthorized`: Token não fornecido ou inválido.
  - **Acesso:** `ADVISOR`.

---
