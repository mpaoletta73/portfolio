import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');

const projectsTitle = document.querySelector('.projects-title');
if (projectsTitle) {
  const count = Array.isArray(projects) ? projects.length : 0;
  projectsTitle.textContent = `Projects (${count})`;
}

const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
const colors = d3.scaleOrdinal(d3.schemeTableau10);

let selectedYear = null;
let query = '';

function getSearchFiltered() {
  return (projects ?? []).filter((project) => {
    const values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

function getBothFiltered() {
  const searchFiltered = getSearchFiltered();
  if (!selectedYear) return searchFiltered;
  return searchFiltered.filter((p) => p.year === selectedYear);
}

function renderPieChart(projectsGiven) {
  const rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );

  const data = rolledData.map(([year, count]) => ({
    value: count,
    label: year,
  }));

  const svg = d3.select('#projects-pie-plot');
  svg.selectAll('path').remove();

  const legend = d3.select('.legend');
  legend.selectAll('li').remove();

  if (data.length === 0) return;

  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(data);
  const arcs = arcData.map((d) => arcGenerator(d));

  const selectedIdx = selectedYear
    ? data.findIndex((d) => d.label === selectedYear)
    : -1;

  arcs.forEach((arc, i) => {
    svg
      .append('path')
      .attr('d', arc)
      .attr('fill', colors(i))
      .attr('class', i === selectedIdx ? 'selected' : '')
      .on('click', () => {
        selectedYear = selectedYear === data[i].label ? null : data[i].label;

        const newSelectedIdx = selectedYear
          ? data.findIndex((d) => d.label === selectedYear)
          : -1;

        svg
          .selectAll('path')
          .attr('class', (_, idx) => (idx === newSelectedIdx ? 'selected' : ''));

        legend
          .selectAll('li')
          .attr('class', (_, idx) =>
            idx === newSelectedIdx ? 'legend-item selected' : 'legend-item',
          );

        renderProjects(getBothFiltered(), projectsContainer, 'h2');
      });
  });

  data.forEach((d, idx) => {
    legend
      .append('li')
      .attr('class', idx === selectedIdx ? 'legend-item selected' : 'legend-item')
      .attr('style', `--color:${colors(idx)}`)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`);
  });
}

renderProjects(projects ?? [], projectsContainer, 'h2');
renderPieChart(projects ?? []);

const searchInput = document.querySelector('.searchBar');
if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    query = event.target.value;
    const searchFiltered = getSearchFiltered();
    renderPieChart(searchFiltered);
    renderProjects(getBothFiltered(), projectsContainer, 'h2');
  });
}
