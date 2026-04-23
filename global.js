console.log("IT'S ALIVE!");

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'
    : '/portfolio/';

const pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'cv.html', title: 'Resume' },
  { url: 'https://github.com/mpaoletta73', title: 'GitHub' },
];

document.body.insertAdjacentHTML(
  'afterbegin',
  `
    <label class="color-scheme">
      Theme:
      <select>
        <option value="light dark">Automatic</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>`,
);

const nav = document.createElement('nav');
document.body.prepend(nav);

for (let p of pages) {
  let url = p.url;
  url = !url.startsWith('http') ? BASE_PATH + url : url;

  const a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;

  a.classList.toggle(
    'current',
    a.host === location.host && a.pathname === location.pathname,
  );

  if (a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }

  nav.append(a);
}

const select = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  select.value = colorScheme;
}

if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
}

select.addEventListener('input', function (event) {
  const colorScheme = event.target.value;
  setColorScheme(colorScheme);
  localStorage.colorScheme = colorScheme;
});

const form = document.querySelector('form');
const formStatus = document.createElement('p');
formStatus.className = 'form-status';
form?.after(formStatus);

form?.addEventListener('submit', function (event) {
  event.preventDefault();

  const data = new FormData(form);
  const params = new URLSearchParams();

  for (let [name, value] of data) {
    params.set(name, value);
  }

  const url = `${form.action}?${params.toString()}`;

  formStatus.innerHTML = `Opening your email app… If nothing happens, <a href="${url}">click here</a>.`;

  requestAnimationFrame(() => {
    window.location.href = url;
  });
});

export async function fetchJSON(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch JSON: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
    return null;
  }
}

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!containerElement) {
    console.error('renderProjects: containerElement is missing or invalid.');
    return;
  }

  const safeHeadingLevel = /^h[1-6]$/i.test(headingLevel) ? headingLevel.toLowerCase() : 'h2';
  containerElement.innerHTML = '';

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p>No projects available yet.</p>';
    return;
  }

  for (let project of projects) {
    const article = document.createElement('article');
    const title = project?.title ?? 'Untitled Project';
    const image = project?.image ?? 'https://vis-society.github.io/labs/2/images/empty.svg';
    const description = project?.description ?? 'No description available.';

    article.innerHTML = `
      <${safeHeadingLevel}>${title}</${safeHeadingLevel}>
      <img src="${image}" alt="${title}">
      <p>${description}</p>
    `;

    containerElement.appendChild(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}

export async function fetchGithubData(username) {
  return fetchGitHubData(username);
}