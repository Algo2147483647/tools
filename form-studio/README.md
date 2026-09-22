# Formily Form Designer

This project is a visual form designer based on Formily that allows users to create and configure forms through drag and drop.

## Project Structure

```
creator/
├── index.html           # Redirect file
├── README.md            # Project documentation
└── assets/              # Resource folder
    ├── index.html       # Main page
    ├── styles.css       # Style file
    └── script.js        # JavaScript logic file
```

## File Description

### assets/index.html
Main page file containing the HTML structure of the entire form designer.

### assets/styles.css
All CSS styles are centralized in this file for easy maintenance and modification.

### assets/script.js
Contains all JavaScript logic, including:
- Component drag and drop functionality
- Form rendering logic
- Property configuration panel
- Schema import/export functionality
- Form preview functionality

## Features

1. **Visual Drag-and-Drop Design**: Drag components from the left panel to the canvas area
2. **Real-time Property Configuration**: Click on components to configure properties in the right panel
3. **Schema Import/Export**: Support importing and exporting form configurations in JSON Schema format
4. **Real-time Preview**: Preview form effects anytime
5. **Responsive Design**: Adapt to different screen sizes

## Usage

1. Open `index.html` file in browser
2. Drag the required components from the left component panel to the middle canvas area
3. Click on components in the canvas to configure properties in the right panel
4. Use the top toolbar buttons for preview, import, export and other operations