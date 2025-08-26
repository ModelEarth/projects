Create a well formatted display of all the issues publically available within all the repos in my Github account using the Github API. Avoid using placeholder data. Create stylish pagination using pages of 20.  Display in a new page at projects/issues.html, projects/js/issues.js, projects/css/issues.css

Display a #repo dropdown menu defaulting to "All Repos" with the name of each repo and (x) with the number of open issues. Only show repos that have at least one issue. Filter by the selected repo. Update the hash as repos are selected, store the #repo in browser cache and recall from the hash (priority) or cache.

Provide a "Sort by" button with a popup to choose Modify Date and other sorts.  Display "Sort by: Modify Date" when selected, update the hash and store in the browser cache to recall the sort.

Provide an "Assigned to" button with a popup to choose existing individuals assigned to the issues.  Display "Assigned to: [Name]" when selected, update the hash and store in the browser cache to recall the sort.

Add a wide range of related functinoality and truly push the limits to create a super useful and easy to use issue manager. Link to Github page, format the issue robustly, include discussion threads and all other data available via the API, including detail on each repository, including the number of files, and the first four images found in each repository.