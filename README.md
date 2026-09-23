# Ingestion fichier Excel

Client React local pour contrôler et envoyer directement les fichiers PV et VN vers Supabase.

## Démarrage

```powershell
npm install
npm run dev
```

## Configuration Supabase

La connexion suit uniquement ce flux :

```text
React -> API REST Supabase
```

Renseigner une clé publique dans l’interface ou dans `.env.local` :

```text
VITE_SUPABASE_URL=https://rmjxrloyrtcfpfckvooy.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Ne jamais utiliser une clé `sb_secret_*` ou `service_role` dans le frontend. Les insertions directes doivent être protégées par les politiques RLS de `chargements` et `uploads`. Un jeton de session utilisateur peut être renseigné dans l’interface lorsque les politiques exigent le rôle `authenticated`.

## Fonctionnement

- lecture locale des fichiers `.xlsx` de 50 Mo maximum ;
- détection de `Data Postventa` pour PV et `Modelo Ventas` pour VN ;
- traduction des 37 colonnes avec `column_mapping.json` ;
- affichage, copie et téléchargement d’un JSON utilisant directement les colonnes de `uploads` ;
- simulation du mapping sans accès réseau ;
- création du lot dans `chargements` ;
- insertion des lignes PV/VN dans `uploads` par blocs ;
- progression visible et interruption avec `AbortController`.

## Consultation BDD

La page `Données BDD` interroge directement `public.uploads` avec le filtre `survey=eq.<id>`. Elle fournit la recherche, la pagination et une action `Historique` par ligne qui affiche le contenu JSONB du champ `history`.
