class BusytexDataPackageResolver {
    constructor(data_packages_js, texmf_system = [], texmf_local = [], remap = {
        config: null,
        firstaid: 'latex-firstaid',
        hyphen: null,
        jknapltx: null,
        latexconfig: null,
        pdfwin: null,
        plweb: 'pl',
        symbol: null,
        syntax: null,
        third: null,
        twoup: null,
        zapfding: null
    }) {
        this.regex_usepackage = /\\usepackage(\[.*?\])?\{(.+?)\}/g;
        this.regex_providespackage = /\\ProvidesPackage\{(.+?)\}(\[.*?\])?/g;
        this.basename = path => path.slice(path.lastIndexOf('/') + 1);
        this.dirname = path => path.slice(0, path.lastIndexOf('/'));
        this.isfile = path => this.basename(path).includes('.');

        this.msgs = [];
        this.data_packages_js = data_packages_js;
        this.data_packages = data_packages_js.map(data_package_js => [
            data_package_js,
            fetch(data_package_js)
                .then(r => r.text())
                .then(script => new Set(Array.from(script.matchAll(this.regex_providespackage)).map(g => g[1].toLowerCase().trim())))
        ]);
        this.remap = remap;
        this.texmf_local_texmfdist_tex = texmf_local.map(t => t + '/texmf-dist/tex/');
        this.texmf_system_texmfdist_tex = texmf_system.map(t => t + '/texmf-dist/tex/');
        this.texmf_texmfdist_tex = [...this.texmf_system_texmfdist_tex, ...this.texmf_local_texmfdist_tex];
        this.data_packages_cache = null;
    }

    async resolve_data_packages() {
        const values = await Promise.all(this.data_packages.map(([k, v]) => v));
        return this.data_packages.map(([k, v], i) => [k, Array.from(values[i]).sort()]);
    }

    cache_data_packages() {
        if (!this.data_packages_cache)
            this.data_packages_cache = Promise.all(this.data_packages_js.map(data_package_js => fetch(data_package_js.replace('.js', '.data'), { mode: 'no-cors' })));
    }

    extract_tex_package_name(path, contents = '') {
        const splitrootdir = p => { const s = p.split('/'); return [s[0], s.slice(1).join('/')]; };
        if (!path.endsWith('.sty')) return null;

        const basename = this.basename(path);
        let tex_package_name = basename.slice(0, basename.length - '.sty'.length);
        if (this.isfile(path)) {
            const prefix = this.texmf_texmfdist_tex.find(t => path.startsWith(t));
            if (contents) {
                const tex_packages = contents.split('\n').filter(l => l.trim().startsWith('\\ProvidesPackage')).map(l => Array.from(l.matchAll(this.regex_providespackage)).filter(groups => groups.length >= 2).map(groups => groups[0])).flat();
                if (tex_packages.length > 0)
                    tex_package_name = tex_packages[0];
            } else if (prefix) {
                tex_package_name = splitrootdir(splitrootdir(path.slice(prefix.length))[1])[0];
                if (tex_package_name in this.remap)
                    tex_package_name = this.remap[tex_package_name];
            }
        }
        return tex_package_name;
    }

    async resolve(files, main_tex_path, data_packages_js = null) {
        if (this.data_packages.length === 0) return {};

        const tex_packages = files
            .filter(f => typeof f.contents === 'string' && f.path === main_tex_path)
            .map(f => f.contents.split('\n').filter(l => l.trim().startsWith('\\usepackage')).map(l => Array.from(l.matchAll(this.regex_usepackage)).filter(groups => groups.length >= 2).map(groups => groups.pop().split(','))))
            .flat(3);

        const tex_packages_local = new Set(
            files
                .filter(f => this.texmf_local_texmfdist_tex.some(t => f.path.startsWith(t)) || f.path.endsWith('.sty'))
                .map(f => this.extract_tex_package_name(f.path, typeof f.contents === 'string' ? f.contents : ''))
                .filter(Boolean)
        );

        const tex_packages_to_resolve = tex_packages.filter(p => !tex_packages_local.has(p));
        const resolved = Object.fromEntries(tex_packages.map(p => [p, { used: true, source: null }]));
        for (const p of tex_packages_local) {
            resolved[p] = resolved[p] || {};
            resolved[p].source = 'local';
            resolved[p].used = resolved[p].used || false;
        }

        let update_data_packages_js = false;
        let data_packages = [];

        if (data_packages_js === null) {
            update_data_packages_js = true;
            data_packages = this.data_packages;
            data_packages_js = new Set();
        } else {
            data_packages = this.data_packages.filter(([dp]) => data_packages_js.includes(dp));
        }

        for (const tex_package of tex_packages_to_resolve) {
            for (const [dp_js, pkg_set_promise] of data_packages) {
                if (pkg_set_promise && (await pkg_set_promise).has(tex_package)) {
                    resolved[tex_package].source = dp_js;
                    if (update_data_packages_js) data_packages_js.add(dp_js);
                    break;
                }
            }
        }

        return resolved;
    }
}

class BusytexBibtexResolver {
    static text(contents) {
        if (typeof contents === 'string') return contents;
        if (ArrayBuffer.isView(contents) || contents instanceof ArrayBuffer)
            return new TextDecoder().decode(contents);
        return '';
    }

    matches(files, needles) {
        return files.some(f => {
            if (!f.path.endsWith('.tex')) return false;
            const text = BusytexBibtexResolver.text(f.contents);
            return needles.some(needle => text.includes(needle));
        });
    }

    resolve(files, bib_tex_commands = ['\\bibliography', '\\printbibliography']) {
        return this.matches(files, bib_tex_commands);
    }

    resolve_backend(files, biblatex_backend_options = ['backend=biber', 'backend = biber']) {
        return this.matches(files, biblatex_backend_options) ? 'biber' : 'bibtex8';
    }
}

function fastHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

class BusytexPipeline {
    static texmf_system = ['/texlive', '/texmf'];
    static VerboseSilent = 'silent';
    static VerboseInfo = 'info';
    static VerboseDebug = 'debug';

    static preRun = [];
    static calledRun = false;
    static data_packages = [];
    static locateFile(remote_package_name) {
        return BusytexPipeline.data_packages.map(dp => dp.replace('.js', '.data')).find(df => df.endsWith(remote_package_name));
    }

    static ScriptLoaderDocument(src) {
        return new Promise((resolve, reject) => {
            const s = self.document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            self.document.head.appendChild(s);
        });
    }

    static ScriptLoaderRequire(src) {
        return new Promise(resolve => self.require([src], resolve));
    }

    static ScriptLoaderWorker(src) {
        return Promise.resolve(self.importScripts(src));
    }

    load_package(data_package_js) {
        if (data_package_js in this.data_package_promises)
            return this.data_package_promises[data_package_js];
        BusytexPipeline.calledRun = false;
        BusytexPipeline.data_packages.push(data_package_js);
        if (!BusytexPipeline.FS_createPath) {
            const noop = () => { };
            BusytexPipeline.FS_createPath = noop;
            BusytexPipeline.FS_createDataFile = noop;
            BusytexPipeline.FS_createPreloadedFile = noop;
            BusytexPipeline.FS_createLazyFile = noop;
            BusytexPipeline.FS_unlink = noop;
        }
        const promise = this.script_loader(data_package_js);
        this.data_package_promises[data_package_js] = promise;
        return promise;
    }

    constructor(busytex_js, busytex_wasm, data_packages_js, preload_data_packages_js, texmf_local, print, on_initialized, preload, script_loader, biber_js = null, biber_wasm = null, biber_data = null) {
        // Silence noisy console.log + postMessage flood unless explicitly needed
        this.print = () => { };
        this.preload = preload;
        this.script_loader = script_loader;

        this.project_dir = '/home/web_user/project_dir';
        this.bin_busytex = '/bin/busytex';
        this.fmt = {
            pdftex: '/texlive/texmf-dist/texmf-var/web2c/pdftex/pdflatex.fmt',
            xetex: '/texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt',
            luahbtex: '/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt',
            luatex: '/texlive/texmf-dist/texmf-var/web2c/luahbtex/lualatex.fmt',
        };
        this.dir_texmfdist = [...BusytexPipeline.texmf_system, ...texmf_local].map(texmf => texmf + '/texmf-dist').join(':');
        this.dir_texmfvar = '/texlive/texmf-dist/texmf-var';
        this.dir_cnf = '/texlive/texmf-dist/web2c';
        this.dir_fontconfig = '/texlive';
        this.texmflog = '/tmp/texmf.log';
        this.missfontlog = 'missfont.log';

        this.verbose_args = {
            [BusytexPipeline.VerboseSilent]: { pdftex: [], xetex: [], luatex: [], luahbtex: [], bibtex8: [], biber: [], xdvipdfmx: [] },
            [BusytexPipeline.VerboseInfo]: {
                pdftex: ['-kpathsea-debug', '32'],
                xetex: ['-kpathsea-debug', '32'],
                luatex: ['-kpathsea-debug', '32'],
                luahbtex: ['-kpathsea-debug', '32'],
                xdvipdfmx: ['--kpathsea-debug', '32', '-v'],
                bibtex8: ['--debug', 'search'],
                biber: [],
            },
            [BusytexPipeline.VerboseDebug]: {
                pdftex: ['-kpathsea-debug', '63', '-recorder'],
                xetex: ['-kpathsea-debug', '63', '-recorder'],
                luatex: ['-kpathsea-debug', '63', '-recorder', '--debug-format'],
                luahbtex: ['-kpathsea-debug', '63', '-recorder', '--debug-format'],
                xdvipdfmx: ['--kpathsea-debug', '63', '-vv'],
                bibtex8: ['--debug', 'all'],
                biber: ['--debug'],
            },
        };
        this.supported_drivers = ['xetex_bibtex8_dvipdfmx', 'pdftex_bibtex8', 'luahbtex_bibtex8', 'luatex_bibtex8'];
        this.biber = biber_js && biber_wasm && biber_data && typeof BusytexBiber !== 'undefined' ? new BusytexBiber(biber_js, biber_wasm, biber_data, this.print, this.script_loader) : null;

        this.error_messages_fatal = ['Fatal error occurred', 'That was a fatal error', ':fatal:', '! Undefined control sequence.', 'undefined old font command'];
        this.error_messages_all = this.error_messages_fatal.concat(['no output PDF file produced', 'No pages of output.']);

        this.rerun_patterns = [
            'Rerun to get',
            'Rerun LaTeX',
            'rerunfilecheck',
            'Label(s) may have changed',
            'There were undefined references',
            'run LaTeX again',
        ];

        this.max_tex_passes = 2;

        this.env = {
            TEXMFDIST: this.dir_texmfdist,
            TEXMFVAR: this.dir_texmfvar,
            TEXMFCACHE: this.dir_texmfvar,
            TEXMFCNF: this.dir_cnf,
            TEXMFLOG: this.texmflog,
            FONTCONFIG_PATH: this.dir_fontconfig,
            FONTCONFIG_FILE: this.dir_fontconfig + '/fonts.conf',
            ICU_DATA: '/texlive/',
            TEXLIVE_REMOTE_ENDPOINT: '',
            MKTEXTFM: '0',
            MKTEXPK: '0',
            MKTEXMF: '0',
            MKTEXFMT: '0'
        };

        this.remove = (FS, p) => FS.analyzePath(p).exists ? FS.unlink(p) : null;
        this.read_all_text = (FS, p) => FS.analyzePath(p).exists ? FS.readFile(p, { encoding: 'utf8' }).trim() : '';
        this.read_all_bytes = (FS, p) => FS.analyzePath(p).exists ? FS.readFile(p, { encoding: 'binary' }) : new Uint8Array();
        this.mkdir_p = (FS, PATH, dirpath, dirs = new Set()) => {
            if (!dirpath || dirpath === '/' || dirs.has(dirpath)) return;
            this.mkdir_p(FS, PATH, PATH.dirname(dirpath), dirs);
            if (!FS.analyzePath(dirpath).exists) FS.mkdir(dirpath);
            dirs.add(dirpath);
        };

        this.bibtex_resolver = new BusytexBibtexResolver();
        this.data_package_resolver = new BusytexDataPackageResolver(data_packages_js, BusytexPipeline.texmf_system, texmf_local);
        this.wasm_module_promise = fetch(busytex_wasm).then(response => {
            if (!response.ok) throw new Error(`Failed to fetch WASM module: ${busytex_wasm} (HTTP ${response.status})`);
            return WebAssembly.compileStreaming ? WebAssembly.compileStreaming(response) : response.arrayBuffer().then(WebAssembly.compile);
        });
        this.mem_header_size = 2 ** 26;
        this._cached_mem_header = null;
        this._preamble_fmt_cache = new Map(); // preambleHash -> fmtFilePath | false

        this.em_module_promise = this.script_loader(busytex_js);
        BusytexPipeline.data_packages = [];
        this.data_package_promises = {};
        this.preload_data_packages_js = preload_data_packages_js;
        for (const dp of this.preload_data_packages_js)
            this.load_package(dp);

        this.on_initialized = null;
        this.on_initialized_promise = new Promise(resolve => (this.on_initialized = resolve));
        this.on_initialized_promise_notification = this.on_initialized_promise.then(on_initialized);

        this.Module = this.reload_module_if_needed(this.preload !== false, this.env, this.project_dir, this.preload_data_packages_js);
    }

    terminate() {
        this.Module = null;
        this._cached_mem_header = null;
    }

    async reload_module_if_needed(cond, env, project_dir, data_packages_js) {
        if (cond) {
            return this.reload_module(env, project_dir, data_packages_js, true);
        } else if (this.Module) {
            const Module = await this.Module;
            const enabled_packages_js = Module.data_packages_js;
            const new_data_packages_js = data_packages_js.filter(dp => !enabled_packages_js.includes(dp));

            if (new_data_packages_js.length > 0) {
                return this.reload_module(env, project_dir, Array.from(enabled_packages_js).concat(Array.from(new_data_packages_js)), false);
            }
            return Module;
        }
    }

    async reload_module(env, project_dir, data_packages_js = [], report_applet_versions = false) {
        const data_packages_js_promise = data_packages_js.map(dp => this.load_package(dp));
        const [em_module, wasm_module] = await Promise.all([
            this.em_module_promise,
            WebAssembly.compileStreaming ? this.wasm_module_promise : this.wasm_module_promise.then(r => r.arrayBuffer()),
            ...data_packages_js_promise
        ]);

        const pre_run_packages = Module => () => {
            Module['FS_createPath'] = Module.FS.createPath;
            Module['FS_createDataFile'] = Module.FS.createDataFile;
            Module['FS_createPreloadedFile'] = Module.FS.createPreloadedFile;
            Module['FS_createLazyFile'] = Module.FS.createLazyFile;
            Module['FS_unlink'] = Module.FS.unlink;

            Object.setPrototypeOf(BusytexPipeline, Module);

            for (const preRun of BusytexPipeline.preRun) {
                if (Module.preRuns.includes(preRun)) continue;
                preRun(Module);
                Module.preRuns.push(preRun);
            }
        };

        const Module = {
            thisProgram: this.bin_busytex,
            noInitialRun: true,
            totalDependencies: 0,
            prefix: '',
            preRuns: [],
            data_packages_js: data_packages_js,
            pre_run_packages: pre_run_packages,

            preRun: [
                () => { Object.assign(Module.ENV, env); Module.FS.mkdir(project_dir); self.LZ4 = Module.LZ4; },
                () => pre_run_packages(Module)()
            ],

            instantiateWasm(imports, successCallback) {
                WebAssembly.instantiate(wasm_module, imports)
                    .then(output => successCallback(WebAssembly.compileStreaming ? output : output.instance))
                    .catch(err => { throw new Error('Error while initializing BusyTex!\n\n' + err.toString()); });
                return {};
            },

            do_print: false,
            output_stdout: '',
            print(text) {
                text = (arguments.length > 1 ? Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stdout += text + '\n';
            },
            output_stderr: '',
            printErr(text) {
                text = (arguments.length > 1 ? Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stderr += text + '\n';
            },

            setPrefix(text) { this.prefix = text; },
            setStatus() { },
            monitorRunDependencies() { },

            callMainWithRedirects(args = [], print = false) {
                const Module = this;
                Module.do_print = print;
                Module.output_stdout = '';
                Module.output_stderr = '';
                Module.setPrefix(args[0]);
                const exit_code = Module.callMain(args);
                Module._flush_streams();
                return { exit_code, stdout: Module.output_stdout, stderr: Module.output_stderr };
            }
        };

        const moduleFactory = typeof busytex !== 'undefined' ? busytex
            : typeof pdftex !== 'undefined' ? pdftex
                : typeof xetex !== 'undefined' ? xetex
                    : typeof luahbtex !== 'undefined' ? luahbtex
                        : null;
        if (!moduleFactory) throw new Error('No BusyTeX module factory found.');
        const initialized_module = await moduleFactory(Module);

        // Snapshot the clean WASM heap header ONCE upon initialization instead of every compile
        this._cached_mem_header = new Uint8Array(this.mem_header_size);
        this._cached_mem_header.set(initialized_module.HEAPU8.subarray(0, this.mem_header_size));

        initialized_module.applet_versions = { pdftex: 'ready', xetex: 'ready', luahbtex: 'ready', bibtex8: 'ready' };
        if (report_applet_versions && this.on_initialized) {
            this.on_initialized(initialized_module.applet_versions);
        }

        return initialized_module;
    }

    _needs_rerun(log_text) {
        return this.rerun_patterns.some(p => log_text.includes(p));
    }

    _run_cmd(Module, FS, cmd, error_messages, verbose, log_path, blg_path, aux_path, bbl_path, logs) {
        const is_bibtex = cmd[0].startsWith('bibtex');
        const cmd_log_path = is_bibtex ? blg_path : log_path;
        const cmd_aux_path = is_bibtex ? bbl_path : aux_path;

        this.remove(FS, this.texmflog);
        this.remove(FS, this.missfontlog);
        this.remove(FS, cmd_log_path);

        const { exit_code, stdout, stderr } = Module.callMainWithRedirects([...cmd], false);

        // Fast heap reset: restore the 64MB static data segment and zero only active heap above it
        if (this._cached_mem_header) {
            Module.HEAPU8.set(this._cached_mem_header, 0);
            Module.HEAPU8.fill(0, this.mem_header_size);
        }

        const aux = this.read_all_text(FS, cmd_aux_path);
        const log = this.read_all_text(FS, cmd_log_path);
        const effective_exit_code = stdout.trim() ? (error_messages.some(err => stdout.includes(err)) ? exit_code : 0) : exit_code;

        logs.push({
            cmd: cmd.join(' '),
            texmflog: '',
            missfontlog: '',
            log: log.trim(),
            aux: aux.trim(),
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exit_code: effective_exit_code
        });

        return { exit_code: effective_exit_code, log };
    }

    /**
     * Precompiles the document preamble (everything before \begin{document}) into a
     * binary .fmt snapshot inside MEMFS using `pdftex -ini`.
     * Subsequent compiles load this .fmt in ~10ms, skipping all \documentclass and \usepackage overhead!
     */
    _try_prepare_preamble_fmt(Module, FS, PATH, driver, files, main_tex_path, tex_path, shell_escape_args) {
        if (driver !== 'pdftex_bibtex8') return null;

        const mainFile = files.find(f => f.path === main_tex_path);
        if (!mainFile || typeof mainFile.contents !== 'string') return null;

        const content = mainFile.contents;
        const docIdx = content.indexOf('\\begin{document}');
        if (docIdx === -1) return null;

        const preamble = content.slice(0, docIdx).trim();
        const body = content.slice(docIdx);

        // Skip custom .fmt if preamble uses packages incompatible with \dump (e.g. tikz externalize or hyperref AtBeginDocument hooks that fail in ini mode)
        if (!preamble || preamble.length < 20) return null;

        const preambleHash = fastHash(preamble);
        const fmtJobName = `_teeex_pre_${preambleHash}`;
        const fmtFileName = `${fmtJobName}.fmt`;

        if (this._preamble_fmt_cache.get(preambleHash) === false) {
            return null; // Previously failed to dump this preamble; use standard compile
        }

        if (this._preamble_fmt_cache.has(preambleHash) && FS.analyzePath(fmtFileName).exists) {
            // Fast path: .fmt already exists in MEMFS! Write body-only tex file and use custom fmt
            FS.writeFile(tex_path, body);
            return fmtFileName;
        }

        // Attempt one-time -ini dump of preamble
        const iniTexName = `${fmtJobName}.tex`;
        const iniContent = `${preamble}\n\\dump\n`;
        try {
            FS.writeFile(iniTexName, iniContent);
            const iniCmd = [
                'pdflatex',
                '-ini',
                ...shell_escape_args,
                '--interaction=batchmode',
                '--halt-on-error',
                `-jobname=${fmtJobName}`,
                `&${this.fmt.pdftex}`,
                iniTexName
            ];
            const { exit_code } = Module.callMainWithRedirects(iniCmd, false);
            if (this._cached_mem_header) {
                Module.HEAPU8.set(this._cached_mem_header, 0);
                Module.HEAPU8.fill(0, this.mem_header_size);
            }

            if (exit_code === 0 && FS.analyzePath(fmtFileName).exists) {
                this._preamble_fmt_cache.set(preambleHash, fmtFileName);
                FS.writeFile(tex_path, body);
                return fmtFileName;
            } else {
                this._preamble_fmt_cache.set(preambleHash, false);
                return null;
            }
        } catch {
            this._preamble_fmt_cache.set(preambleHash, false);
            return null;
        }
    }

    async read_project_files(dir = null) {
        const Module = await this.Module;
        if (!Module) return [];
        const { FS, PATH } = Module;
        const root = dir || this.project_dir;
        const results = [];
        const walk = d => {
            for (const name of FS.readdir(d)) {
                if (name === '.' || name === '..') continue;
                const full = PATH.join(d, name);
                const stat = FS.stat(full);
                if (FS.isDir(stat.mode)) walk(full);
                else results.push({ path: full.slice(root.length + 1), contents: this.read_all_bytes(FS, full) });
            }
        };
        if (FS.analyzePath(root).exists) walk(root);
        return results;
    }

    async write_texlive_remote_files(files) {
        const Module = await this.Module;
        if (!Module) throw new Error('Module not initialized');
        for (const f of files) {
            const bytes = f.contents || f.content;
            if (bytes) {
                Module.kpse_remote_register(f.name, f.format != null ? f.format : 26, bytes);
            }
        }
    }

    async write_texlive_remote_misses(keys) {
        const Module = await this.Module;
        if (!Module) throw new Error('Module not initialized');
        Module.kpse_remote_register_misses(keys);
    }

    async compile(files, main_tex_path, bibtex, biber = null, makeindex = null, rerun = null, verbose, driver, data_packages_js = [], remote_endpoint = '', shell_escape = false, clean = false) {
        if (!this.supported_drivers.includes(driver))
            throw new Error(`Driver [${driver}] is not supported`);

        if (bibtex === null)
            bibtex = this.bibtex_resolver.resolve(files);

        const bib_backend = biber === null ? this.bibtex_resolver.resolve_backend(files) : (biber ? 'biber' : 'bibtex8');
        if (biber === true) bibtex = true;

        this.Module = this.reload_module_if_needed(this.Module == null, this.env, this.project_dir, data_packages_js);
        const Module = await this.Module;

        if (remote_endpoint)
            Module.ENV.TEXLIVE_REMOTE_ENDPOINT = remote_endpoint;

        const { FS, PATH } = Module;
        const tex_path = PATH.basename(main_tex_path);
        const dirname = PATH.dirname(main_tex_path);

        const [xdv_path, pdf_path, log_path, aux_path, blg_path, bbl_path, idx_path, ind_path] =
            ['.xdv', '.pdf', '.log', '.aux', '.blg', '.bbl', '.idx', '.ind'].map(ext => tex_path.replace('.tex', ext));

        const verbose_args_for = key => (this.verbose_args[verbose] || this.verbose_args[BusytexPipeline.VerboseSilent])[key];
        const shell_escape_args = shell_escape ? ['--shell-escape'] : ['--no-shell-escape'];

        const project_stat = FS.analyzePath(this.project_dir);
        const is_mounted = project_stat.exists && project_stat.object && project_stat.object.mount && project_stat.object.mount.mountpoint === this.project_dir;
        const entry_changed = this._last_main_tex_path && this._last_main_tex_path !== main_tex_path;
        if ((clean || entry_changed) && is_mounted) {
            try { FS.unmount(this.project_dir); } catch { }
            this._preamble_fmt_cache.clear();
        }
        this._last_main_tex_path = main_tex_path;

        if (clean || entry_changed || !is_mounted) {
            this.mkdir_p(FS, PATH, this.project_dir);
            FS.mount(FS.filesystems.MEMFS, {}, this.project_dir);
            this._known_project_files = new Set();
        }

        if (!this._known_project_files) {
            this._known_project_files = new Set();
        }

        const current_file_paths = new Set();
        const dirs = new Set(['/', this.project_dir]);
        for (const { path, contents } of files) {
            const absolute_path = PATH.join(this.project_dir, path);
            current_file_paths.add(path);
            if (contents == null) {
                this.mkdir_p(FS, PATH, absolute_path, dirs);
            } else {
                this.mkdir_p(FS, PATH, PATH.dirname(absolute_path), dirs);
                FS.writeFile(absolute_path, contents);
            }
        }

        const AUX_EXTS = ['.aux', '.toc', '.bbl', '.blg', '.out', '.idx', '.ind', '.ilg', '.xdv', '.pdf', '.synctex.gz', '.bcf', '.log', '.nav', '.snm', '.vrb', '.fls', '.fmt'];
        for (const old_path of this._known_project_files) {
            if (!current_file_paths.has(old_path)) {
                const is_aux = AUX_EXTS.some(ext => old_path.endsWith(ext));
                if (!is_aux) {
                    const abs = PATH.join(this.project_dir, old_path);
                    if (FS.analyzePath(abs).exists) {
                        try { FS.unlink(abs); } catch { }
                    }
                }
            }
        }
        this._known_project_files = current_file_paths;

        const source_dir = PATH.join(this.project_dir, dirname);
        FS.chdir(source_dir);

        // Try precompiled .fmt preamble acceleration
        const customFmt = this._try_prepare_preamble_fmt(Module, FS, PATH, driver, files, main_tex_path, tex_path, shell_escape_args);
        const activePdftexFmt = customFmt || this.fmt.pdftex;

        const xetex_cmd = ['xelatex', '-synctex=1', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--no-pdf', '--fmt', this.fmt.xetex, tex_path].concat(verbose_args_for('xetex'));
        const pdftex_final = ['pdflatex', '-synctex=1', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--output-format=pdf', '--fmt', activePdftexFmt, tex_path].concat(verbose_args_for('pdftex'));
        const pdftex_nonfinal = ['pdflatex', '-synctex=1', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--fmt', activePdftexFmt, tex_path].concat(verbose_args_for('pdftex'));
        const luahbtex_final = ['luahblatex', '-synctex=1', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--output-format=pdf', '--fmt', this.fmt.luahbtex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const luahbtex_nonfinal = ['luahblatex', '-synctex=1', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--fmt', this.fmt.luahbtex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const luatex_final = ['lualatex', '-synctex=1', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--output-format=pdf', '--fmt', this.fmt.luatex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const luatex_nonfinal = ['lualatex', '-synctex=1', ...shell_escape_args, '--interaction=nonstopmode', '--halt-on-error', '--fmt', this.fmt.luatex, '--nosocket', tex_path].concat(verbose_args_for('luahbtex'));
        const bibtex8_cmd = ['bibtex8', '--8bit'].concat(verbose_args_for('bibtex8')).concat([aux_path]);
        const makeindex_cmd = ['makeindex', idx_path];
        const xdvipdfmx_cmd = ['xdvipdfmx'].concat(verbose_args_for('xdvipdfmx')).concat(['-o', pdf_path, xdv_path]);

        const driver_cmds = {
            xetex_bibtex8_dvipdfmx: { initial: xetex_cmd, nonfinal: xetex_cmd, final: xetex_cmd, dvi: xdvipdfmx_cmd },
            pdftex_bibtex8: { initial: pdftex_final, nonfinal: pdftex_nonfinal, final: pdftex_final, dvi: null },
            luahbtex_bibtex8: { initial: luahbtex_final, nonfinal: luahbtex_nonfinal, final: luahbtex_final, dvi: null },
            luatex_bibtex8: { initial: luatex_final, nonfinal: luatex_nonfinal, final: luatex_final, dvi: null },
        };

        const { initial, nonfinal, final: final_cmd, dvi } = driver_cmds[driver];
        const logs = [];

        const run = (cmd, error_messages) =>
            this._run_cmd(Module, FS, cmd, error_messages, verbose, log_path, blg_path, aux_path, bbl_path, logs);

        let { exit_code, log: last_log } = run(initial, this.error_messages_fatal);

        // If custom .fmt failed during body compilation, fall back to full compile automatically
        if (exit_code !== 0 && customFmt) {
            const mainFile = files.find(f => f.path === main_tex_path);
            if (mainFile) {
                const docIdx = mainFile.contents.indexOf('\\begin{document}');
                const preambleHash = fastHash(mainFile.contents.slice(0, docIdx).trim());
                this._preamble_fmt_cache.set(preambleHash, false);
                FS.writeFile(tex_path, mainFile.contents);
                logs.length = 0;
                const fallbackCmd = ['pdflatex', '-synctex=1', ...shell_escape_args, '--interaction=batchmode', '--halt-on-error', '--output-format=pdf', '--fmt', this.fmt.pdftex, tex_path];
                ({ exit_code, log: last_log } = run(fallbackCmd, this.error_messages_fatal));
            }
        }

        let bibtex_ran = false;
        if (exit_code === 0 && bibtex) {
            let bibtex_needed = true;
            if (FS.analyzePath(bbl_path).exists) {
                const aux_content = this.read_all_text(FS, aux_path);
                const citations = (aux_content.match(/\\citation\{[^}]+\}/g) || []).join(';');
                const bibdata = (aux_content.match(/\\bibdata\{[^}]+\}/g) || []).join(';');
                const bibstyle = (aux_content.match(/\\bibstyle\{[^}]+\}/g) || []).join(';');
                let bib_sig = '';
                for (const f of files) {
                    if (f.path && f.path.endsWith('.bib')) {
                        const len = f.contents ? (typeof f.contents === 'string' ? f.contents.length : f.contents.byteLength) : 0;
                        bib_sig += `${f.path}:${len};`;
                    }
                }
                const current_sig = `${citations}|${bibdata}|${bibstyle}|${bib_sig}`;
                if (this._last_bib_sig === current_sig && this.read_all_text(FS, bbl_path).trim() !== '') {
                    bibtex_needed = false;
                } else {
                    this._last_bib_sig = current_sig;
                }
            }

            if (bibtex_needed) {
                if (bib_backend === 'biber' && this.biber != null)
                    exit_code = await this._run_biber(FS, tex_path, files, verbose_args_for('biber'), logs);
                else
                    ({ exit_code } = run(bibtex8_cmd, this.error_messages_fatal));
                bibtex_ran = true;

                if (exit_code === 0 && this.read_all_text(FS, bbl_path).trim() === '') {
                    bibtex = false;
                    bibtex_ran = false;
                }
            }
        }

        const makeindex_enabled = makeindex === null ? true : makeindex;
        let makeindex_active = makeindex_enabled && exit_code === 0 && FS.analyzePath(idx_path).exists && this.read_all_text(FS, idx_path).trim() !== '';
        let makeindex_ran = false;
        if (makeindex_active) {
            ({ exit_code } = run(makeindex_cmd, this.error_messages_fatal));
            makeindex_ran = true;
            if (exit_code === 0 && this.read_all_text(FS, ind_path).trim() === '') {
                makeindex_active = false;
                makeindex_ran = false;
            }
        }

        const rerun_enabled = rerun === null ? true : rerun;
        if (exit_code === 0) {
            const initial_is_final = (initial === final_cmd);
            const needs_rerun = this._needs_rerun(last_log);
            const aux_tools_ran = bibtex_ran || makeindex_ran;

            if (rerun_enabled && (needs_rerun || aux_tools_ran || !initial_is_final)) {
                for (let pass = 0; pass < this.max_tex_passes; pass++) {
                    const is_last_pass = pass === this.max_tex_passes - 1;
                    const cmd = is_last_pass ? final_cmd : (initial_is_final ? final_cmd : nonfinal);
                    const error_messages = is_last_pass ? this.error_messages_all : this.error_messages_fatal;

                    ({ exit_code, log: last_log } = run(cmd, error_messages));
                    if (exit_code !== 0) break;

                    if (!this._needs_rerun(last_log)) {
                        if (cmd !== final_cmd) {
                            ({ exit_code, log: last_log } = run(final_cmd, this.error_messages_all));
                        }
                        break;
                    }
                }
            } else if (!rerun_enabled && !initial_is_final) {
                ({ exit_code, log: last_log } = run(final_cmd, this.error_messages_all));
            }
        }

        if (exit_code === 0 && dvi) {
            ({ exit_code } = run(dvi, this.error_messages_all));
        }

        const pdf = exit_code === 0 ? this.read_all_bytes(FS, pdf_path) : null;
        const synctex = exit_code === 0 ? this.read_all_bytes(FS, tex_path.replace('.tex', '.synctex.gz')) : null;
        const logcat = logs.map(({ log, stdout, stderr }) => [log, stdout, stderr].filter(Boolean).join('\n')).join('\n\n');

        this.Module = this.preload === false ? null : this.Module;

        return { pdf, synctex, log: logcat, exit_code, logs };
    }
}

if (typeof self !== 'undefined') self.BusytexPipeline = BusytexPipeline;