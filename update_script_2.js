const fs = require('fs');
const path = './src/pages/GlobalBrandStrategy.tsx';
let content = fs.readFileSync(path, 'utf8');

// Identity Header
content = content.replace(
  /<p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Identity<\/p>/g,
  '<p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{localStorage.getItem(\'vult_language\') === \'en\' ? \'Identity\' : \'Identidad\'}</p>'
);

// Full Name Label
content = content.replace(
  /<label className="text-xs text-slate-500 block mb-1">Full Name \*<\/label>/g,
  '<label className="text-xs text-slate-500 block mb-1">{localStorage.getItem(\'vult_language\') === \'en\' ? \'Full Name *\' : \'Nombre Completo *\'}</label>'
);

// Full Name Input Placeholder
content = content.replace(
  /placeholder="e\.g\. Marketing Manager Maria"/g,
  'placeholder={localStorage.getItem(\'vult_language\') === \'en\' ? "e.g. Marketing Manager Maria" : "ej. Gerente de Marketing María"}'
);

// Identity Map Array
const oldMap = `{\\(\\[\\[\\'ageRange\\', \\'Age Range\\', \\'e.g. 28–40\\'\\]\\, \\[\\'gender\\', \\'Gender\\', \\'e.g. Female\\'\\]\\, \\[\\'location\\', \\'Location\\', \\'e.g. Miami, FL\\'\\]\\, \\[\\'jobTitle\\', \\'Job Title\\', \\'e.g. Marketing Director\\'\\]\\, \\[\\'income\\', \\'Income \\/ Budget\\', \\'e.g. \\$80K–\\$120K\\/yr\\'\\]\\] as const\\)`;
const newMap = `([
                                                ['ageRange', localStorage.getItem('vult_language') === 'en' ? 'Age Range' : 'Rango de Edad', localStorage.getItem('vult_language') === 'en' ? 'e.g. 28–40' : 'ej. 28–40'], 
                                                ['gender', localStorage.getItem('vult_language') === 'en' ? 'Gender' : 'Género', localStorage.getItem('vult_language') === 'en' ? 'e.g. Female' : 'ej. Femenino'], 
                                                ['location', localStorage.getItem('vult_language') === 'en' ? 'Location' : 'Ubicación', localStorage.getItem('vult_language') === 'en' ? 'e.g. Miami, FL' : 'ej. CDMX, México'], 
                                                ['jobTitle', localStorage.getItem('vult_language') === 'en' ? 'Job Title' : 'Puesto de Trabajo', localStorage.getItem('vult_language') === 'en' ? 'e.g. Marketing Director' : 'ej. Director de Marketing'], 
                                                ['income', localStorage.getItem('vult_language') === 'en' ? 'Income / Budget' : 'Ingresos / Presupuesto', localStorage.getItem('vult_language') === 'en' ? 'e.g. $80K–$120K/yr' : 'ej. $80K–$120K/año']
                                            ] as const)`;
content = content.replace(/\{\(\[\[\'ageRange\', \'Age Range\', \'e\.g\. 28–40\'\], \[\'gender\', \'Gender\', \'e\.g\. Female\'\], \[\'location\', \'Location\', \'e\.g\. Miami, FL\'\], \[\'jobTitle\', \'Job Title\', \'e\.g\. Marketing Director\'\], \[\'income\', \'Income \/ Budget\', \'e\.g\. \$80K–\$120K\/yr\'\]\] as const\)/g, newMap);

// Psychographics Header
content = content.replace(
  /<p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Psychographics<\/p>/g,
  '<p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{localStorage.getItem(\'vult_language\') === \'en\' ? \'Psychographics\' : \'Psicografía\'}</p>'
);

// Psychographics Map Array
const newPsychoMap = `([
                                                    ['goals', localStorage.getItem('vult_language') === 'en' ? 'Goals & Desires' : 'Metas y Deseos', localStorage.getItem('vult_language') === 'en' ? 'What does this persona want to achieve?' : '¿Qué quiere lograr esta persona?'], 
                                                    ['painPoints', localStorage.getItem('vult_language') === 'en' ? 'Pain Points' : 'Puntos de Dolor', localStorage.getItem('vult_language') === 'en' ? 'What frustrates them the most?' : '¿Qué es lo que más le frustra?'], 
                                                    ['objections', localStorage.getItem('vult_language') === 'en' ? 'Objections' : 'Objeciones', localStorage.getItem('vult_language') === 'en' ? 'Why might they hesitate to buy?' : '¿Por qué dudaría en comprar?'], 
                                                    ['mediaHabits', localStorage.getItem('vult_language') === 'en' ? 'Media & Platform Habits' : 'Hábitos en Medios y Plataformas', localStorage.getItem('vult_language') === 'en' ? 'Where do they consume content?' : '¿Dónde consume contenido?']
                                                ] as const)`;
content = content.replace(/\{\(\[\[\'goals\', \'Goals \& Desires\', \'What does this persona want to achieve\?\'\], \[\'painPoints\', \'Pain Points\', \'What frustrates them the most\?\'\], \[\'objections\', \'Objections\', \'Why might they hesitate to buy\?\'\], \[\'mediaHabits\', \'Media \& Platform Habits\', \'Where do they consume content\?\'\]\] as const\)/g, newPsychoMap);

// Voice Cues Header
content = content.replace(
  /<p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Voice Cues<\/p>/g,
  '<p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{localStorage.getItem(\'vult_language\') === \'en\' ? \'Voice Cues\' : \'Pistas de Voz\'}</p>'
);

// Preferred Tone Label & Input
content = content.replace(
  /<label className="text-xs text-slate-500 block mb-1">Preferred Tone<\/label>/g,
  '<label className="text-xs text-slate-500 block mb-1">{localStorage.getItem(\'vult_language\') === \'en\' ? \'Preferred Tone\' : \'Tono Preferido\'}</label>'
);
content = content.replace(
  /placeholder="e\.g\. Direct, no-fluff, data-driven"/g,
  'placeholder={localStorage.getItem(\'vult_language\') === \'en\' ? "e.g. Direct, no-fluff, data-driven" : "e.g. Directo, sin relleno, basado en datos"}'
);

// Trigger Words Label & Input
content = content.replace(
  /<label className="text-xs text-slate-500 block mb-1">Trigger Words & Phrases<\/label>/g,
  '<label className="text-xs text-slate-500 block mb-1">{localStorage.getItem(\'vult_language\') === \'en\' ? \'Trigger Words & Phrases\' : \'Palabras y Frases Clave\'}</label>'
);
content = content.replace(
  /placeholder="Words that resonate: 'ROI', 'scalable', 'proven'"/g,
  'placeholder={localStorage.getItem(\'vult_language\') === \'en\' ? "Words that resonate: \'ROI\', \'scalable\', \'proven\'" : "Palabras que resuenan: \'ROI\', \'escalable\', \'probado\'"}'
);

// Modal Title Label
content = content.replace(
  /<h3 className="font-bold text-white flex items-center gap-2"><Users className="size-4 text-purple-400" \/> \{editingPersona \? 'Edit Persona' : 'New Buyer Persona'\}<\/h3>/g,
  '<h3 className="font-bold text-white flex items-center gap-2"><Users className="size-4 text-purple-400" /> {editingPersona ? (localStorage.getItem(\'vult_language\') === \'en\' ? \'Edit Persona\' : \'Editar Persona\') : (localStorage.getItem(\'vult_language\') === \'en\' ? \'New Buyer Persona\' : \'Nuevo Buyer Persona\')}</h3>'
);

// Footer Labels
content = content.replace(
  />Cancel<\/button>/g,
  '>{localStorage.getItem(\'vult_language\') === \'en\' ? \'Cancel\' : \'Cancelar\'}</button>'
);
content = content.replace(
  /\{editingPersona \? 'Save Changes' : 'Create Persona'\}/g,
  '{editingPersona ? (localStorage.getItem(\'vult_language\') === \'en\' ? \'Save Changes\' : \'Guardar Cambios\') : (localStorage.getItem(\'vult_language\') === \'en\' ? \'Create Persona\' : \'Crear Persona\')}'
);

// Fix the missing closing tags and fragment
content = content.replace(
/                                        \{editingPersona \? 'Save Changes' : 'Create Persona'\}\n                                    <\/button>\n                                <\/div>\n                            <\/div>\n                        <\/motion.div>\n                <\/>\n                    \)\}\n            <\/AnimatePresence>/g,
  `                                        {editingPersona ? (localStorage.getItem('vult_language') === 'en' ? 'Save Changes' : 'Guardar Cambios') : (localStorage.getItem('vult_language') === 'en' ? 'Create Persona' : 'Crear Persona')}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>`
);


fs.writeFileSync(path, content, 'utf8');
